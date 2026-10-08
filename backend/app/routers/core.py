from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import (
    Bug,
    BugStatus,
    DateType,
    Deployment,
    DeploymentRequirement,
    DeploymentStatus,
    Environment,
    Priority,
    Project,
    Requirement,
    RequirementStatus,
    RequirementType,
    RequirementVersion,
    Role,
    Sprint,
    SprintStatus,
    Task,
    TaskStatus,
    TaskType,
    TestCase,
    TestStatus,
    TimeLog,
    User,
)
from ..security import get_current_user, is_manager

router = APIRouter(tags=["core"])

VERSIONED_FIELDS = ("title", "description", "priority", "status")
CLOSED_BUG_STATES = (BugStatus.CLOSED, BugStatus.RESOLVED)


def _forbid(detail: str = "Insufficient permissions") -> None:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _get_or_404(session: Session, model: Any, item_id: int) -> Any:
    obj = session.get(model, item_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} {item_id} not found")
    return obj


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _may_edit_qa(user: User) -> bool:
    return is_manager(user) or user.role == Role.QA_ENGINEER


# --------------------------------------------------------------- projects
class ProjectIn(BaseModel):
    name: str
    description: str = ""
    status: Optional[str] = None


@router.get("/projects")
def list_projects(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return session.exec(select(Project).order_by(Project.id)).all()


@router.get("/projects/{item_id}")
def get_project(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, Project, item_id)


@router.post("/projects", status_code=201)
def create_project(
    payload: ProjectIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    project = Project(**payload.model_dump(exclude_none=True))
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.patch("/projects/{item_id}")
def update_project(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    project = _get_or_404(session, Project, item_id)
    for key, value in payload.items():
        if hasattr(project, key) and key != "id":
            setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.delete("/projects/{item_id}", status_code=204)
def delete_project(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if user.role != Role.ADMIN:
        _forbid("Only ADMIN can delete projects")
    session.delete(_get_or_404(session, Project, item_id))
    session.commit()


# ----------------------------------------------------------- requirements
class RequirementIn(BaseModel):
    req_code: Optional[str] = None
    project_id: int
    title: str
    description: str = ""
    type: RequirementType = RequirementType.FUNCTIONAL
    priority: Priority = Priority.MEDIUM
    status: RequirementStatus = RequirementStatus.DRAFT
    owner_id: Optional[int] = None
    design_reference: Optional[str] = None


@router.get("/requirements")
def list_requirements(
    project_id: Optional[int] = None,
    status_filter: Optional[RequirementStatus] = None,
    priority: Optional[Priority] = None,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Requirement)
    if project_id is not None:
        stmt = stmt.where(Requirement.project_id == project_id)
    if status_filter is not None:
        stmt = stmt.where(Requirement.status == status_filter)
    if priority is not None:
        stmt = stmt.where(Requirement.priority == priority)
    if q:
        stmt = stmt.where(Requirement.title.contains(q))
    return session.exec(stmt.order_by(Requirement.req_code)).all()


@router.get("/requirements/{item_id}")
def get_requirement(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, Requirement, item_id)


@router.post("/requirements", status_code=201)
def create_requirement(
    payload: RequirementIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    data = payload.model_dump()
    if not data.get("req_code"):
        count = session.exec(select(func.count()).select_from(Requirement)).one()
        data["req_code"] = f"REQ-{101 + int(count)}"
    requirement = Requirement(**data)
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    session.add(
        RequirementVersion(
            requirement_id=requirement.id, version=1, changed_by=user.id, summary="Created"
        )
    )
    session.commit()
    return requirement


@router.patch("/requirements/{item_id}")
def update_requirement(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    requirement = _get_or_404(session, Requirement, item_id)
    changes: list[str] = []
    for key, value in payload.items():
        if not hasattr(requirement, key) or key in ("id", "version"):
            continue
        old = getattr(requirement, key)
        if _enum_value(old) == _enum_value(value):
            continue
        if key in VERSIONED_FIELDS:
            if key in ("title", "description"):
                changes.append(f"{key} updated")
            else:
                changes.append(f"{key}: {_enum_value(old)} -> {_enum_value(value)}")
        setattr(requirement, key, value)
    if changes:
        requirement.version += 1
        session.add(
            RequirementVersion(
                requirement_id=requirement.id,
                version=requirement.version,
                changed_by=user.id,
                summary="; ".join(changes),
            )
        )
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    return requirement


@router.delete("/requirements/{item_id}", status_code=204)
def delete_requirement(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not is_manager(user):
        _forbid()
    session.delete(_get_or_404(session, Requirement, item_id))
    session.commit()


@router.get("/requirements/{item_id}/history")
def requirement_history(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    _get_or_404(session, Requirement, item_id)
    rows = session.exec(
        select(RequirementVersion)
        .where(RequirementVersion.requirement_id == item_id)
        .order_by(RequirementVersion.version.desc())
    ).all()
    names = {u.id: u.full_name for u in session.exec(select(User)).all()}
    return [
        {
            "id": r.id,
            "version": r.version,
            "summary": r.summary,
            "changed_by": r.changed_by,
            "changed_by_name": names.get(r.changed_by, "System"),
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/requirements/{item_id}/links")
def requirement_links(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    _get_or_404(session, Requirement, item_id)
    deployment_ids = session.exec(
        select(DeploymentRequirement.deployment_id).where(
            DeploymentRequirement.requirement_id == item_id
        )
    ).all()
    deployments = (
        session.exec(select(Deployment).where(Deployment.id.in_(deployment_ids))).all()
        if deployment_ids
        else []
    )
    return {
        "tasks": session.exec(select(Task).where(Task.requirement_id == item_id)).all(),
        "test_cases": session.exec(
            select(TestCase).where(TestCase.requirement_id == item_id)
        ).all(),
        "bugs": session.exec(select(Bug).where(Bug.requirement_id == item_id)).all(),
        "deployments": deployments,
    }


# ---------------------------------------------------------------- sprints
class SprintIn(BaseModel):
    project_id: int
    sprint_number: int
    name: str
    goal: str = ""
    start_date: date
    end_date: date
    status: SprintStatus = SprintStatus.PLANNED


@router.get("/sprints")
def list_sprints(
    project_id: Optional[int] = None,
    status_filter: Optional[SprintStatus] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sprint)
    if project_id is not None:
        stmt = stmt.where(Sprint.project_id == project_id)
    if status_filter is not None:
        stmt = stmt.where(Sprint.status == status_filter)
    return session.exec(stmt.order_by(Sprint.sprint_number)).all()


@router.get("/sprints/{item_id}")
def get_sprint(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, Sprint, item_id)


@router.post("/sprints", status_code=201)
def create_sprint(
    payload: SprintIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    sprint = Sprint(**payload.model_dump())
    session.add(sprint)
    session.commit()
    session.refresh(sprint)
    return sprint


@router.patch("/sprints/{item_id}")
def update_sprint(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    sprint = _get_or_404(session, Sprint, item_id)
    for key, value in payload.items():
        if hasattr(sprint, key) and key != "id":
            setattr(sprint, key, value)
    session.add(sprint)
    session.commit()
    session.refresh(sprint)
    return sprint


@router.delete("/sprints/{item_id}", status_code=204)
def delete_sprint(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not is_manager(user):
        _forbid()
    session.delete(_get_or_404(session, Sprint, item_id))
    session.commit()


# ------------------------------------------------------------------ tasks
class TaskIn(BaseModel):
    sprint_id: Optional[int] = None
    requirement_id: Optional[int] = None
    title: str
    task_type: TaskType = TaskType.DEVELOPMENT
    estimate_hours: float = 8
    status: TaskStatus = TaskStatus.TODO
    assigned_to: Optional[int] = None


class TimeLogIn(BaseModel):
    hours: float
    date: Optional[DateType] = None


@router.get("/tasks")
def list_tasks(
    sprint_id: Optional[int] = None,
    requirement_id: Optional[int] = None,
    assigned_to: Optional[int] = None,
    status_filter: Optional[TaskStatus] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Task)
    if sprint_id is not None:
        stmt = stmt.where(Task.sprint_id == sprint_id)
    if requirement_id is not None:
        stmt = stmt.where(Task.requirement_id == requirement_id)
    if assigned_to is not None:
        stmt = stmt.where(Task.assigned_to == assigned_to)
    if status_filter is not None:
        stmt = stmt.where(Task.status == status_filter)
    return session.exec(stmt.order_by(Task.id)).all()


@router.get("/tasks/{item_id}")
def get_task(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, Task, item_id)


@router.post("/tasks", status_code=201)
def create_task(
    payload: TaskIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    task = Task(**payload.model_dump())
    if task.status == TaskStatus.DONE:
        task.completed_at = datetime.utcnow()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.patch("/tasks/{item_id}")
def update_task(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    task = _get_or_404(session, Task, item_id)
    if not is_manager(user):
        if user.role != Role.DEVELOPER or task.assigned_to != user.id:
            _forbid("You can only update tasks assigned to you")
        if set(payload.keys()) - {"status"}:
            _forbid("Developers can only change task status")
    for key, value in payload.items():
        if hasattr(task, key) and key != "id":
            setattr(task, key, value)
    if task.status == TaskStatus.DONE:
        if task.completed_at is None:
            task.completed_at = datetime.utcnow()
    else:
        task.completed_at = None
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{item_id}", status_code=204)
def delete_task(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not is_manager(user):
        _forbid()
    session.delete(_get_or_404(session, Task, item_id))
    session.commit()


@router.post("/tasks/{item_id}/time-logs", status_code=201)
def create_time_log(
    item_id: int,
    payload: TimeLogIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    task = _get_or_404(session, Task, item_id)
    if not is_manager(user) and task.assigned_to != user.id:
        _forbid("You can only log time on tasks assigned to you")
    log = TimeLog(
        task_id=item_id,
        developer_id=user.id,
        hours=payload.hours,
        date=payload.date or date.today(),
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return log


# ------------------------------------------------------------------- bugs
class BugIn(BaseModel):
    bug_code: Optional[str] = None
    project_id: int
    requirement_id: Optional[int] = None
    sprint_id: Optional[int] = None
    title: str
    severity: Priority = Priority.MEDIUM
    status: BugStatus = BugStatus.OPEN
    assignee_id: Optional[int] = None


@router.get("/bugs")
def list_bugs(
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    requirement_id: Optional[int] = None,
    severity: Optional[Priority] = None,
    status_filter: Optional[BugStatus] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Bug)
    if project_id is not None:
        stmt = stmt.where(Bug.project_id == project_id)
    if sprint_id is not None:
        stmt = stmt.where(Bug.sprint_id == sprint_id)
    if requirement_id is not None:
        stmt = stmt.where(Bug.requirement_id == requirement_id)
    if severity is not None:
        stmt = stmt.where(Bug.severity == severity)
    if status_filter is not None:
        stmt = stmt.where(Bug.status == status_filter)
    return session.exec(stmt.order_by(Bug.bug_code)).all()


@router.get("/bugs/{item_id}")
def get_bug(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, Bug, item_id)


@router.post("/bugs", status_code=201)
def create_bug(
    payload: BugIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not _may_edit_qa(user):
        _forbid()
    data = payload.model_dump()
    if not data.get("bug_code"):
        count = session.exec(select(func.count()).select_from(Bug)).one()
        data["bug_code"] = f"BUG-{101 + int(count)}"
    bug = Bug(**data)
    session.add(bug)
    session.commit()
    session.refresh(bug)
    return bug


@router.patch("/bugs/{item_id}")
def update_bug(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    bug = _get_or_404(session, Bug, item_id)
    if not _may_edit_qa(user):
        if user.role != Role.DEVELOPER or bug.assignee_id != user.id:
            _forbid()
        if set(payload.keys()) - {"status"}:
            _forbid("Developers can only change bug status")
    for key, value in payload.items():
        if hasattr(bug, key) and key != "id":
            setattr(bug, key, value)
    session.add(bug)
    session.commit()
    session.refresh(bug)
    return bug


@router.delete("/bugs/{item_id}", status_code=204)
def delete_bug(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not _may_edit_qa(user):
        _forbid()
    session.delete(_get_or_404(session, Bug, item_id))
    session.commit()


# -------------------------------------------------------------- test cases
class TestCaseIn(BaseModel):
    test_code: Optional[str] = None
    requirement_id: int
    title: str
    expected_result: str = ""
    status: TestStatus = TestStatus.NOT_RUN


@router.get("/test-cases")
def list_test_cases(
    requirement_id: Optional[int] = None,
    status_filter: Optional[TestStatus] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(TestCase)
    if requirement_id is not None:
        stmt = stmt.where(TestCase.requirement_id == requirement_id)
    if status_filter is not None:
        stmt = stmt.where(TestCase.status == status_filter)
    return session.exec(stmt.order_by(TestCase.test_code)).all()


@router.get("/test-cases/{item_id}")
def get_test_case(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _get_or_404(session, TestCase, item_id)


@router.post("/test-cases", status_code=201)
def create_test_case(
    payload: TestCaseIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not _may_edit_qa(user):
        _forbid()
    data = payload.model_dump()
    if not data.get("test_code"):
        count = session.exec(select(func.count()).select_from(TestCase)).one()
        data["test_code"] = f"TC-{101 + int(count)}"
    test_case = TestCase(**data)
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return test_case


@router.patch("/test-cases/{item_id}")
def update_test_case(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not _may_edit_qa(user):
        _forbid()
    test_case = _get_or_404(session, TestCase, item_id)
    for key, value in payload.items():
        if hasattr(test_case, key) and key != "id":
            setattr(test_case, key, value)
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return test_case


@router.delete("/test-cases/{item_id}", status_code=204)
def delete_test_case(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not _may_edit_qa(user):
        _forbid()
    session.delete(_get_or_404(session, TestCase, item_id))
    session.commit()


# ------------------------------------------------------------- deployments
class DeploymentIn(BaseModel):
    project_id: int
    sprint_id: Optional[int] = None
    version: str
    environment: Environment = Environment.DEV
    status: DeploymentStatus = DeploymentStatus.PENDING
    requirement_ids: list[int] = []


def _deployment_out(session: Session, deployment: Deployment) -> dict:
    req_ids = session.exec(
        select(DeploymentRequirement.requirement_id).where(
            DeploymentRequirement.deployment_id == deployment.id
        )
    ).all()
    data = deployment.model_dump()
    data["requirement_ids"] = list(req_ids)
    return data


@router.get("/deployments")
def list_deployments(
    project_id: Optional[int] = None,
    environment: Optional[Environment] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Deployment)
    if project_id is not None:
        stmt = stmt.where(Deployment.project_id == project_id)
    if environment is not None:
        stmt = stmt.where(Deployment.environment == environment)
    rows = session.exec(stmt.order_by(Deployment.id.desc())).all()
    by_deployment: dict[int, list[int]] = {}
    for link in session.exec(select(DeploymentRequirement)).all():
        by_deployment.setdefault(link.deployment_id, []).append(link.requirement_id)
    out = []
    for row in rows:
        data = row.model_dump()
        data["requirement_ids"] = by_deployment.get(row.id, [])
        out.append(data)
    return out


@router.get("/deployments/{item_id}")
def get_deployment(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    return _deployment_out(session, _get_or_404(session, Deployment, item_id))


@router.post("/deployments", status_code=201)
def create_deployment(
    payload: DeploymentIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    data = payload.model_dump()
    requirement_ids = data.pop("requirement_ids", [])
    deployment = Deployment(**data)
    session.add(deployment)
    session.commit()
    session.refresh(deployment)
    for req_id in requirement_ids:
        session.add(DeploymentRequirement(deployment_id=deployment.id, requirement_id=req_id))
    session.commit()
    return _deployment_out(session, deployment)


@router.patch("/deployments/{item_id}")
def update_deployment(
    item_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        _forbid()
    deployment = _get_or_404(session, Deployment, item_id)
    requirement_ids = payload.pop("requirement_ids", None)
    for key, value in payload.items():
        if hasattr(deployment, key) and key != "id":
            setattr(deployment, key, value)
    if requirement_ids is not None:
        for link in session.exec(
            select(DeploymentRequirement).where(DeploymentRequirement.deployment_id == item_id)
        ).all():
            session.delete(link)
        for req_id in requirement_ids:
            session.add(DeploymentRequirement(deployment_id=item_id, requirement_id=req_id))
    session.add(deployment)
    session.commit()
    session.refresh(deployment)
    return _deployment_out(session, deployment)


@router.delete("/deployments/{item_id}", status_code=204)
def delete_deployment(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    if not is_manager(user):
        _forbid()
    for link in session.exec(
        select(DeploymentRequirement).where(DeploymentRequirement.deployment_id == item_id)
    ).all():
        session.delete(link)
    session.delete(_get_or_404(session, Deployment, item_id))
    session.commit()


# ------------------------------------------------------------------ users
@router.get("/users")
def list_users(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(User).order_by(User.id)).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value,
            "is_active": u.is_active,
            "skills": u.skills,
            "capacity_hours": u.capacity_hours,
        }
        for u in rows
    ]


@router.get("/users/developers")
def list_developers(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    rows = session.exec(select(User).where(User.role == Role.DEVELOPER).order_by(User.id)).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "skills": u.skills,
            "capacity_hours": u.capacity_hours,
        }
        for u in rows
    ]


# -------------------------------------------------------------- dashboard
@router.get("/dashboard")
def dashboard(
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if project_id is None:
        first = session.exec(select(Project).order_by(Project.id)).first()
        project_id = first.id if first else 0

    requirements = session.exec(
        select(Requirement).where(Requirement.project_id == project_id)
    ).all()
    sprints = session.exec(select(Sprint).where(Sprint.project_id == project_id)).all()
    sprint_ids = [s.id for s in sprints]
    req_ids = [r.id for r in requirements]
    tasks = (
        session.exec(select(Task).where(Task.sprint_id.in_(sprint_ids))).all() if sprint_ids else []
    )
    bugs = session.exec(select(Bug).where(Bug.project_id == project_id)).all()
    test_cases = (
        session.exec(select(TestCase).where(TestCase.requirement_id.in_(req_ids))).all()
        if req_ids
        else []
    )
    deployments = session.exec(select(Deployment).where(Deployment.project_id == project_id)).all()

    active_sprint = next((s for s in sprints if s.status == SprintStatus.ACTIVE), None)
    done_tasks = [t for t in tasks if t.status == TaskStatus.DONE]
    open_bugs = [b for b in bugs if b.status not in CLOSED_BUG_STATES]

    return {
        "project_id": project_id,
        "counts": {
            "requirements": len(requirements),
            "sprints": len(sprints),
            "tasks": len(tasks),
            "tasks_done": len(done_tasks),
            "open_bugs": len(open_bugs),
            "critical_bugs": len([b for b in open_bugs if b.severity == Priority.CRITICAL]),
            "test_cases": len(test_cases),
            "tests_passed": len([t for t in test_cases if t.status == TestStatus.PASSED]),
            "tests_failed": len([t for t in test_cases if t.status == TestStatus.FAILED]),
            "deployments": len(deployments),
            "completion_pct": round(100 * len(done_tasks) / len(tasks), 1) if tasks else 0.0,
        },
        "tasks_by_status": [
            {"name": s.value, "value": len([t for t in tasks if t.status == s])} for s in TaskStatus
        ],
        "bugs_by_severity": [
            {"name": p.value, "value": len([b for b in bugs if b.severity == p])} for p in Priority
        ],
        "requirements_by_status": [
            {"name": s.value, "value": len([r for r in requirements if r.status == s])}
            for s in RequirementStatus
            if any(r.status == s for r in requirements)
        ],
        "active_sprint": active_sprint.model_dump() if active_sprint else None,
    }
