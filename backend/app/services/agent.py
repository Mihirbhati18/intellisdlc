"""AI Project Agent.

Function names follow the DFD for process 8:
  8.1 receive_question
  8.2 classify_question
  8.3 retrieve_project_context
  8.4 sanitize_context
  8.5 send_prompt_to_ai_service
  8.6 return_answer

Works with no API key and no internet: when GEMINI_API_KEY is empty (or the
call fails) the agent answers from the retrieved context with a rule-based
summary, so the demo never depends on a network.
"""
import json
import re
from typing import Any, Optional

import httpx
from sqlmodel import Session, select

from ..config import settings
from ..models import (
    Bug,
    BugStatus,
    Deployment,
    Priority,
    Project,
    Requirement,
    Sprint,
    SprintStatus,
    Task,
    TaskStatus,
    TestCase,
    TestStatus,
    User,
)
from . import traceability

MAX_RECORDS = 30
SENSITIVE_KEYS = ("password_hash", "password", "token", "secret", "api_key", "apikey")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
KEY_LIKE_RE = re.compile(r"\b(?:AIza[\w-]{10,}|sk-[\w-]{10,}|eyJ[\w-]{20,})\b")

CATEGORY_KEYWORDS = {
    "SPRINT": ("sprint", "velocity", "burndown", "burn-down", "iteration"),
    "TASKS": ("task", "assigned", "workload", "progress", "todo", "in progress"),
    "BUGS": ("bug", "defect", "issue", "crash", "severity", "critical"),
    "TESTS": ("test", "test case", "qa", "coverage", "passed", "failed"),
    "REQUIREMENTS": ("requirement", "req-", "scope", "feature", "story", "priority"),
    "DEPLOYMENTS": ("deploy", "deployment", "release", "staging", "production", "environment"),
    "RISK": ("risk", "danger", "late", "slip", "delay", "blocked"),
    "TRACEABILITY": ("traceability", "trace", "coverage matrix", "matrix", "linked", "untested"),
}

CLOSED_BUG_STATES = (BugStatus.CLOSED, BugStatus.RESOLVED)


# ------------------------------------------------------------------ 8.1
def receive_question(question: str) -> str:
    return (question or "").strip()


# ------------------------------------------------------------------ 8.2
def classify_question(question: str) -> str:
    text = question.lower()
    scores: dict[str, int] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        hits = len([k for k in keywords if k in text])
        if hits:
            scores[category] = hits
    if not scores:
        return "GENERAL"
    return max(scores.items(), key=lambda item: item[1])[0]


# ------------------------------------------------------------------ 8.3
def _rows(session: Session, statement) -> list[dict]:
    return [row.model_dump() for row in session.exec(statement).all()][:MAX_RECORDS]


def retrieve_project_context(session: Session, project_id: int, category: str) -> dict:
    project = session.get(Project, project_id)
    context: dict[str, Any] = {
        "project": project.model_dump() if project else {},
        "category": category,
    }

    requirement_ids = list(
        session.exec(select(Requirement.id).where(Requirement.project_id == project_id)).all()
    )
    sprint_ids = list(
        session.exec(select(Sprint.id).where(Sprint.project_id == project_id)).all()
    )

    wants = {category}
    if category == "GENERAL":
        wants = {"SPRINT", "TASKS", "BUGS", "REQUIREMENTS"}
    if category == "RISK":
        wants = {"SPRINT", "TASKS", "BUGS", "RISK"}
    if category == "TRACEABILITY":
        wants = {"REQUIREMENTS", "TRACEABILITY"}

    if "REQUIREMENTS" in wants:
        context["requirements"] = _rows(
            session,
            select(Requirement)
            .where(Requirement.project_id == project_id)
            .order_by(Requirement.req_code),
        )
    if "SPRINT" in wants:
        context["sprints"] = _rows(
            session,
            select(Sprint).where(Sprint.project_id == project_id).order_by(Sprint.sprint_number),
        )
    if "TASKS" in wants and sprint_ids:
        context["tasks"] = _rows(session, select(Task).where(Task.sprint_id.in_(sprint_ids)))
        context["team"] = [
            {"id": u.id, "name": u.full_name, "role": u.role.value, "capacity_hours": u.capacity_hours}
            for u in session.exec(select(User)).all()
        ]
    if "BUGS" in wants:
        context["bugs"] = _rows(
            session, select(Bug).where(Bug.project_id == project_id).order_by(Bug.bug_code)
        )
    if "TESTS" in wants and requirement_ids:
        context["test_cases"] = _rows(
            session, select(TestCase).where(TestCase.requirement_id.in_(requirement_ids))
        )
    if "DEPLOYMENTS" in wants:
        context["deployments"] = _rows(
            session, select(Deployment).where(Deployment.project_id == project_id)
        )
    if "TRACEABILITY" in wants:
        matrix = traceability.build_matrix(session, project_id)
        context["traceability_summary"] = matrix["summary"]
        context["traceability_rows"] = matrix["rows"][:MAX_RECORDS]
    if "RISK" in wants:
        context["active_sprint"] = next(
            (
                s.model_dump()
                for s in session.exec(
                    select(Sprint).where(Sprint.project_id == project_id)
                ).all()
                if s.status == SprintStatus.ACTIVE
            ),
            None,
        )

    return context


# ------------------------------------------------------------------ 8.4
def _mask_text(value: str) -> str:
    value = EMAIL_RE.sub(lambda m: m.group(0)[0] + "***@" + m.group(0).split("@")[1], value)
    return KEY_LIKE_RE.sub("[redacted]", value)


def sanitize_context(context: Any) -> Any:
    if isinstance(context, dict):
        clean: dict[str, Any] = {}
        for key, value in context.items():
            if key.lower() in SENSITIVE_KEYS:
                continue
            clean[key] = sanitize_context(value)
        return clean
    if isinstance(context, list):
        return [sanitize_context(item) for item in context]
    if isinstance(context, str):
        return _mask_text(context)
    return context


# ------------------------------------------------------------------ 8.5
def _offline_answer(question: str, category: str, context: dict) -> tuple[str, list[str]]:
    lines: list[str] = []
    sources: list[str] = []

    if category in ("BUGS", "GENERAL", "RISK"):
        bugs = context.get("bugs", [])
        if bugs:
            open_bugs = [b for b in bugs if b["status"] not in ("CLOSED", "RESOLVED")]
            critical = [b for b in open_bugs if b["severity"] == "CRITICAL"]
            lines.append(
                f"- Bugs: {len(open_bugs)} open of {len(bugs)} total, {len(critical)} critical."
            )
            for bug in critical[:3]:
                lines.append(f"  - {bug['bug_code']}: {bug['title']} ({bug['status']})")
                sources.append(bug["bug_code"])

    if category in ("SPRINT", "GENERAL", "RISK"):
        sprints = context.get("sprints", [])
        active = [s for s in sprints if s["status"] == "ACTIVE"]
        if active:
            sprint = active[0]
            lines.append(
                f"- Active sprint: {sprint['name']} (ends {sprint['end_date']}), goal: {sprint['goal']}."
            )
            sources.append(sprint["name"])
        elif sprints:
            lines.append(f"- {len(sprints)} sprints recorded; none is currently active.")

    if category in ("TASKS", "GENERAL", "RISK"):
        tasks = context.get("tasks", [])
        if tasks:
            done = [t for t in tasks if t["status"] == "DONE"]
            blocked = [t for t in tasks if t["status"] == "BLOCKED"]
            lines.append(
                f"- Tasks: {len(done)} of {len(tasks)} done"
                + (f", {len(blocked)} blocked." if blocked else ".")
            )
            team = {u["id"]: u for u in context.get("team", [])}
            load: dict[int, float] = {}
            for task in tasks:
                if task["status"] != "DONE" and task.get("assigned_to"):
                    load[task["assigned_to"]] = load.get(task["assigned_to"], 0.0) + float(
                        task["estimate_hours"]
                    )
            if load:
                busiest_id = max(load, key=load.get)
                busiest = team.get(busiest_id, {})
                name = busiest.get("name", f"user {busiest_id}")
                capacity = busiest.get("capacity_hours", 40)
                lines.append(
                    f"- Heaviest open load: {name} with {load[busiest_id]:.0f}h against a {capacity}h capacity."
                )
                sources.append(name)

    if category in ("REQUIREMENTS", "GENERAL"):
        requirements = context.get("requirements", [])
        if requirements:
            lines.append(f"- Requirements: {len(requirements)} in scope.")
            for requirement in requirements[:4]:
                lines.append(
                    f"  - {requirement['req_code']} {requirement['title']} "
                    f"({requirement['priority']}, {requirement['status']})"
                )
                sources.append(requirement["req_code"])

    if category == "TESTS":
        test_cases = context.get("test_cases", [])
        if test_cases:
            passed = [t for t in test_cases if t["status"] == "PASSED"]
            failed = [t for t in test_cases if t["status"] == "FAILED"]
            not_run = [t for t in test_cases if t["status"] == "NOT_RUN"]
            lines.append(
                f"- Test cases: {len(passed)} passed, {len(failed)} failed, {len(not_run)} not run."
            )
            for test_case in failed[:3]:
                lines.append(f"  - {test_case['test_code']} failed: {test_case['title']}")
                sources.append(test_case["test_code"])

    if category == "DEPLOYMENTS":
        deployments = context.get("deployments", [])
        if deployments:
            succeeded = [d for d in deployments if d["status"] == "SUCCESS"]
            lines.append(
                f"- Deployments: {len(deployments)} recorded, {len(succeeded)} successful."
            )
            for deployment in deployments[:4]:
                lines.append(
                    f"  - {deployment['version']} to {deployment['environment']}: {deployment['status']}"
                )
                sources.append(deployment["version"])

    if category == "TRACEABILITY":
        summary = context.get("traceability_summary", {})
        if summary:
            lines.append(
                f"- Traceability: {summary.get('complete', 0)} complete, "
                f"{summary.get('at_risk', 0)} at risk, {summary.get('incomplete', 0)} incomplete; "
                f"average coverage {summary.get('avg_coverage_pct', 0)}%."
            )
        for row in context.get("traceability_rows", []):
            if row["overall"] != "COMPLETE":
                lines.append(
                    f"  - {row['req_code']} is {row['overall']} "
                    f"(design {row['designed']}, build {row['implemented']}, tests {row['tested']})"
                )
                sources.append(row["req_code"])

    if not lines:
        lines.append("- I could not find project records that answer that question.")

    project_name = context.get("project", {}).get("name", "this project")
    header = f"Here is what the {project_name} records show for your question ({category}):"
    return "\n".join([header, *lines]), sources[:10]


def send_prompt_to_ai_service(question: str, category: str, context: dict) -> tuple[str, str, list[str]]:
    """Returns (answer, mode, sources). Falls back to offline mode on any failure."""
    offline_answer, sources = _offline_answer(question, category, context)

    if not settings.gemini_api_key:
        return offline_answer, "offline", sources

    prompt = (
        "You are the project assistant for an SDLC management tool. "
        "Answer only from the JSON context below. If the context does not contain the answer, "
        "say so plainly. Cite record IDs such as REQ-103, BUG-101 or TC-105 where relevant. "
        "Keep the answer under 150 words.\n\n"
        f"Question: {question}\n\nContext JSON:\n{json.dumps(context, default=str)}"
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    try:
        response = httpx.post(
            url,
            params={"key": settings.gemini_api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=20.0,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["candidates"][0]["content"]["parts"][0]["text"].strip()
        if not text:
            raise ValueError("empty response")
        return text, "gemini", sources
    except Exception:
        return offline_answer, "offline", sources


# ------------------------------------------------------------------ 8.6
def answer_question(session: Session, project_id: int, question: str) -> dict:
    cleaned = receive_question(question)
    if not cleaned:
        return {
            "answer": "Please ask a question about the project.",
            "mode": "offline",
            "category": "GENERAL",
            "sources": [],
        }
    category = classify_question(cleaned)
    raw_context = retrieve_project_context(session, project_id, category)
    context = sanitize_context(raw_context)
    answer, mode, sources = send_prompt_to_ai_service(cleaned, category, context)
    return {"answer": answer, "mode": mode, "category": category, "sources": sources}


def suggested_questions() -> list[str]:
    return [
        "What is the risk of the active sprint?",
        "Which critical bugs are still open?",
        "Which requirements have no test cases?",
        "Who is overloaded this sprint?",
        "What was deployed to production?",
        "Which test cases are failing?",
    ]
