"""Requirement traceability matrix.

For every requirement in a project, derive the five SDLC stages from the links
already stored in the database. All rows are built from bulk queries, so the
matrix costs a fixed number of queries regardless of project size.
"""
from typing import Optional

from sqlmodel import Session, select

from . import repository as repo_service
from ..models import (
    Bug,
    BugStatus,
    Deployment,
    DeploymentRequirement,
    DeploymentStatus,
    Environment,
    Priority,
    Project,
    Requirement,
    Task,
    TaskStatus,
    TaskType,
    TestCase,
    TestStatus,
)

CLOSED_BUG_STATES = (BugStatus.CLOSED, BugStatus.RESOLVED)
ENV_RANK = {Environment.DEV: 1, Environment.STAGING: 2, Environment.PRODUCTION: 3}

DESIGNED_DONE = "DONE"
DESIGNED_MISSING = "MISSING"


def _designed(requirement: Requirement, tasks: list[Task]) -> str:
    if requirement.design_reference:
        return DESIGNED_DONE
    design_tasks = [t for t in tasks if t.task_type == TaskType.DESIGN]
    if design_tasks and any(t.status == TaskStatus.DONE for t in design_tasks):
        return DESIGNED_DONE
    return DESIGNED_MISSING


def _implemented(tasks: list[Task]) -> tuple[str, str]:
    dev_tasks = [t for t in tasks if t.task_type == TaskType.DEVELOPMENT]
    if not dev_tasks:
        return "NOT_STARTED", "0/0"
    done = len([t for t in dev_tasks if t.status == TaskStatus.DONE])
    detail = f"{done}/{len(dev_tasks)}"
    if done == len(dev_tasks):
        return "DONE", detail
    if done == 0:
        return "NOT_STARTED", detail
    return "PARTIAL", detail


def _tested(test_cases: list[TestCase]) -> tuple[str, str]:
    if not test_cases:
        return "NO_TESTS", "0 tests"
    passed = len([t for t in test_cases if t.status == TestStatus.PASSED])
    failed = len([t for t in test_cases if t.status == TestStatus.FAILED])
    detail = f"{passed}/{len(test_cases)} passed"
    if failed:
        return "FAILED", detail
    if passed == len(test_cases):
        return "PASSED", detail
    return "PENDING", detail


def _deployed(deployments: list[Deployment]) -> str:
    successful = [d for d in deployments if d.status == DeploymentStatus.SUCCESS]
    if not successful:
        return "NOT_DEPLOYED"
    highest = max(successful, key=lambda d: ENV_RANK.get(d.environment, 0))
    return highest.environment.value


def _overall(designed: str, implemented: str, tested: str, deployed: str, open_bugs: int, critical_open: int) -> str:
    if tested == "FAILED" or critical_open > 0:
        return "AT_RISK"
    complete = (
        designed == DESIGNED_DONE
        and implemented == "DONE"
        and tested == "PASSED"
        and deployed == Environment.PRODUCTION.value
        and open_bugs == 0
    )
    return "COMPLETE" if complete else "INCOMPLETE"


def _coverage_pct(designed: str, implemented: str, tested: str, deployed: str, open_bugs: int) -> int:
    stages = [
        designed == DESIGNED_DONE,
        implemented == "DONE",
        tested == "PASSED",
        open_bugs == 0,
        deployed == Environment.PRODUCTION.value,
    ]
    return 20 * len([s for s in stages if s])


def build_matrix(session: Session, project_id: Optional[int] = None) -> dict:
    if project_id is None:
        project = session.exec(select(Project).order_by(Project.id)).first()
        project_id = project.id if project else 0

    requirements = session.exec(
        select(Requirement)
        .where(Requirement.project_id == project_id)
        .order_by(Requirement.req_code)
    ).all()
    req_ids = [r.id for r in requirements]
    if not req_ids:
        return {"project_id": project_id, "rows": [], "summary": _summary([])}

    tasks = session.exec(select(Task).where(Task.requirement_id.in_(req_ids))).all()
    test_cases = session.exec(select(TestCase).where(TestCase.requirement_id.in_(req_ids))).all()
    bugs = session.exec(select(Bug).where(Bug.requirement_id.in_(req_ids))).all()
    links = session.exec(
        select(DeploymentRequirement).where(DeploymentRequirement.requirement_id.in_(req_ids))
    ).all()
    deployment_ids = {link.deployment_id for link in links}
    deployments = (
        session.exec(select(Deployment).where(Deployment.id.in_(deployment_ids))).all()
        if deployment_ids
        else []
    )
    deployment_by_id = {d.id: d for d in deployments}
    # Commit evidence sits alongside the task-based view, never replacing it:
    # the gap between 'tasks ticked' and 'code merged' is itself informative.
    commit_counts = repo_service.commit_counts_by_requirement(session, project_id)

    tasks_by_req: dict[int, list[Task]] = {}
    for task in tasks:
        tasks_by_req.setdefault(task.requirement_id, []).append(task)
    tests_by_req: dict[int, list[TestCase]] = {}
    for test_case in test_cases:
        tests_by_req.setdefault(test_case.requirement_id, []).append(test_case)
    bugs_by_req: dict[int, list[Bug]] = {}
    for bug in bugs:
        bugs_by_req.setdefault(bug.requirement_id, []).append(bug)
    deployments_by_req: dict[int, list[Deployment]] = {}
    for link in links:
        deployment = deployment_by_id.get(link.deployment_id)
        if deployment is not None:
            deployments_by_req.setdefault(link.requirement_id, []).append(deployment)

    rows = []
    for requirement in requirements:
        req_tasks = tasks_by_req.get(requirement.id, [])
        req_tests = tests_by_req.get(requirement.id, [])
        req_bugs = bugs_by_req.get(requirement.id, [])
        req_deployments = deployments_by_req.get(requirement.id, [])

        open_bugs = [b for b in req_bugs if b.status not in CLOSED_BUG_STATES]
        critical_open = [b for b in open_bugs if b.severity == Priority.CRITICAL]

        designed = _designed(requirement, req_tasks)
        implemented, implemented_detail = _implemented(req_tasks)
        tested, tested_detail = _tested(req_tests)
        deployed = _deployed(req_deployments)

        rows.append(
            {
                "requirement_id": requirement.id,
                "req_code": requirement.req_code,
                "title": requirement.title,
                "priority": requirement.priority.value,
                "status": requirement.status.value,
                "version": requirement.version,
                "designed": designed,
                "implemented": implemented,
                "implemented_detail": implemented_detail,
                "commits": commit_counts.get(requirement.id, 0),
                "tested": tested,
                "tested_detail": tested_detail,
                "test_count": len(req_tests),
                "open_bugs": len(open_bugs),
                "critical_open_bugs": len(critical_open),
                "deployed": deployed,
                "overall": _overall(
                    designed, implemented, tested, deployed, len(open_bugs), len(critical_open)
                ),
                "coverage_pct": _coverage_pct(
                    designed, implemented, tested, deployed, len(open_bugs)
                ),
            }
        )

    return {"project_id": project_id, "rows": rows, "summary": _summary(rows)}


def _summary(rows: list[dict]) -> dict:
    total = len(rows)
    return {
        "total": total,
        "complete": len([r for r in rows if r["overall"] == "COMPLETE"]),
        "at_risk": len([r for r in rows if r["overall"] == "AT_RISK"]),
        "incomplete": len([r for r in rows if r["overall"] == "INCOMPLETE"]),
        "without_tests": len([r for r in rows if r["tested"] == "NO_TESTS"]),
        "with_commits": len([r for r in rows if r.get("commits", 0) > 0]),
        "avg_coverage_pct": (
            round(sum(r["coverage_pct"] for r in rows) / total, 1) if total else 0.0
        ),
    }
