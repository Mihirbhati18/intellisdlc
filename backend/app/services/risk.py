"""Sprint Risk Predictor.

Function names follow the DFD for process 7:
  7.1 collect_live_sprint_data
  7.2 build_feature_vector
  7.3 run_prediction_model
  7.4 generate_explanation
  7.5 save_prediction
"""
from datetime import date
from typing import Any, Optional

import joblib
import pandas as pd
from sqlmodel import Session, select

from ..config import settings
from ..models import (
    Bug,
    BugStatus,
    Deployment,
    DeploymentStatus,
    Priority,
    Requirement,
    RequirementVersion,
    RiskLevel,
    RiskPrediction,
    Sprint,
    Task,
    TaskStatus,
    User,
)

FEATURES = [
    "open_bugs_count",
    "critical_bugs_count",
    "build_failure_rate",
    "requirement_changes_count",
    "avg_developer_load",
    "missed_deadlines_last_sprint",
    "days_remaining",
    "total_tasks",
    "completed_tasks",
    "completion_ratio",
]

CLOSED_BUG_STATES = (BugStatus.CLOSED, BugStatus.RESOLVED)

FEATURE_LABELS = {
    "open_bugs_count": "Open bugs in this sprint",
    "critical_bugs_count": "Critical open bugs",
    "build_failure_rate": "Deployment failure rate",
    "requirement_changes_count": "Requirement changes during the sprint",
    "avg_developer_load": "Average developer load",
    "missed_deadlines_last_sprint": "Unfinished work carried from the last sprint",
    "days_remaining": "Days left in the sprint",
    "total_tasks": "Sprint size (total tasks)",
    "completed_tasks": "Tasks completed",
    "completion_ratio": "Completion ratio",
}

ACTIONS = {
    "open_bugs_count": "Hold a bug triage and close or defer the low-severity defects before the sprint ends.",
    "critical_bugs_count": "Put a developer on each critical bug today; critical defects block the sprint goal.",
    "build_failure_rate": "Fix the failing pipeline before the next release; repeated failures delay deployment.",
    "requirement_changes_count": "Freeze the scope of this sprint and move new requirement changes to the next one.",
    "avg_developer_load": "Rebalance tasks away from the overloaded developer to someone with spare capacity.",
    "missed_deadlines_last_sprint": "Re-estimate the carried-over tasks and drop the lowest-priority items.",
    "days_remaining": "Very little time is left; cut scope to the committed items only.",
    "total_tasks": "The sprint is large; split the backlog and move non-essential tasks out.",
    "completed_tasks": "Few tasks are finished; break the in-progress work into smaller pieces.",
    "completion_ratio": "Progress is behind the burn-down; pull the sprint goal back to what is achievable.",
}

_model: Optional[Any] = None


def load_model() -> bool:
    """Load the trained pipeline at startup. Returns True when available."""
    global _model
    if _model is not None:
        return True
    if not settings.model_path.exists():
        return False
    bundle = joblib.load(settings.model_path)
    _model = bundle["pipeline"] if isinstance(bundle, dict) else bundle
    return True


def is_model_loaded() -> bool:
    return _model is not None


# ------------------------------------------------------------------ 7.1
def collect_live_sprint_data(session: Session, sprint: Sprint) -> dict:
    tasks = session.exec(select(Task).where(Task.sprint_id == sprint.id)).all()
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.status == TaskStatus.DONE])
    completion_ratio = round(completed_tasks / total_tasks, 3) if total_tasks else 0.0

    bugs = session.exec(select(Bug).where(Bug.sprint_id == sprint.id)).all()
    open_bugs = [b for b in bugs if b.status not in CLOSED_BUG_STATES]
    critical_bugs = [b for b in open_bugs if b.severity == Priority.CRITICAL]

    deployments = session.exec(
        select(Deployment).where(Deployment.project_id == sprint.project_id)
    ).all()
    failed = len([d for d in deployments if d.status == DeploymentStatus.FAILED])
    build_failure_rate = round(failed / len(deployments), 3) if deployments else 0.0

    requirement_ids = session.exec(
        select(Requirement.id).where(Requirement.project_id == sprint.project_id)
    ).all()
    changes = 0
    if requirement_ids:
        versions = session.exec(
            select(RequirementVersion).where(
                RequirementVersion.requirement_id.in_(list(requirement_ids))
            )
        ).all()
        changes = len(
            [
                v
                for v in versions
                if v.version > 1
                and sprint.start_date <= v.created_at.date() <= sprint.end_date
            ]
        )

    unfinished = [t for t in tasks if t.status != TaskStatus.DONE and t.assigned_to]
    capacities = {
        u.id: (u.capacity_hours or 40) for u in session.exec(select(User)).all()
    }
    hours: dict[int, float] = {}
    for task in unfinished:
        hours[task.assigned_to] = hours.get(task.assigned_to, 0.0) + float(task.estimate_hours)
    loads = [h / max(capacities.get(user_id, 40), 1) for user_id, h in hours.items()]
    avg_developer_load = round(sum(loads) / len(loads), 3) if loads else 0.0

    previous = session.exec(
        select(Sprint)
        .where(Sprint.project_id == sprint.project_id)
        .where(Sprint.sprint_number == sprint.sprint_number - 1)
    ).first()
    missed = 0
    if previous is not None:
        previous_tasks = session.exec(select(Task).where(Task.sprint_id == previous.id)).all()
        missed = len([t for t in previous_tasks if t.status != TaskStatus.DONE])

    days_remaining = max((sprint.end_date - date.today()).days, 0)

    return {
        "open_bugs_count": len(open_bugs),
        "critical_bugs_count": len(critical_bugs),
        "build_failure_rate": build_failure_rate,
        "requirement_changes_count": changes,
        "avg_developer_load": avg_developer_load,
        "missed_deadlines_last_sprint": missed,
        "days_remaining": days_remaining,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_ratio": completion_ratio,
    }


# ------------------------------------------------------------------ 7.2
def build_feature_vector(data: dict) -> pd.DataFrame:
    # A DataFrame (not a bare array) so the scaler sees the same column names
    # it was fitted with.
    return pd.DataFrame([{name: float(data[name]) for name in FEATURES}], columns=FEATURES)


# ------------------------------------------------------------------ 7.3
def run_prediction_model(vector: pd.DataFrame) -> tuple[float, RiskLevel]:
    probability = float(_model.predict_proba(vector)[0][1])
    score = round(probability * 100, 1)
    if score < 40:
        level = RiskLevel.LOW
    elif score < 70:
        level = RiskLevel.MEDIUM
    else:
        level = RiskLevel.HIGH
    return score, level


# ------------------------------------------------------------------ 7.4
def generate_explanation(data: dict, vector: pd.DataFrame) -> list[dict]:
    scaler = _model.named_steps["scaler"]
    model = _model.named_steps["model"]
    scaled = scaler.transform(vector)[0]
    coefficients = model.coef_[0]

    contributions = []
    for index, name in enumerate(FEATURES):
        contributions.append(
            {
                "feature": name,
                "label": FEATURE_LABELS[name],
                "value": data[name],
                "contribution": round(float(coefficients[index] * scaled[index]), 4),
            }
        )

    contributions.sort(key=lambda item: item["contribution"], reverse=True)
    drivers = []
    for item in contributions[:3]:
        if item["contribution"] <= 0:
            continue
        drivers.append(
            {
                **item,
                "text": f"{item['label']} is {item['value']}, which pushes the risk up.",
                "action": ACTIONS[item["feature"]],
            }
        )
    if not drivers:
        drivers.append(
            {
                "feature": "completion_ratio",
                "label": FEATURE_LABELS["completion_ratio"],
                "value": data["completion_ratio"],
                "contribution": 0.0,
                "text": "No single metric is pushing this sprint towards risk.",
                "action": "Keep the current pace and review again after the next stand-up.",
            }
        )
    return drivers


# ------------------------------------------------------------------ 7.5
def save_prediction(session: Session, sprint: Sprint, score: float, level: RiskLevel) -> RiskPrediction:
    prediction = RiskPrediction(sprint_id=sprint.id, risk_score=score, risk_level=level)
    session.add(prediction)
    session.commit()
    session.refresh(prediction)
    return prediction


def predict_sprint_risk(session: Session, sprint: Sprint) -> dict:
    data = collect_live_sprint_data(session, sprint)
    vector = build_feature_vector(data)
    score, level = run_prediction_model(vector)
    drivers = generate_explanation(data, vector)
    prediction = save_prediction(session, sprint, score, level)
    return {
        "prediction_id": prediction.id,
        "sprint_id": sprint.id,
        "sprint_name": sprint.name,
        "risk_score": score,
        "risk_level": level.value,
        "features": data,
        "drivers": drivers,
        "actions": [d["action"] for d in drivers],
        "created_at": prediction.created_at,
    }
