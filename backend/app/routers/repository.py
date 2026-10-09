from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Commit,
    CommitRequirement,
    Project,
    Repository,
    Requirement,
    RequirementVersion,
    User,
)
from ..security import get_current_user, is_manager
from ..services import repository as repo_service

router = APIRouter(tags=["repository"])


class RepositoryIn(BaseModel):
    project_id: int
    name: str
    path: str
    auto_update_status: bool = False


class RepositoryUpdate(BaseModel):
    name: Optional[str] = None
    auto_update_status: Optional[bool] = None


def _require_manager(user: User) -> None:
    if not is_manager(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ADMIN or PROJECT_MANAGER can manage repositories",
        )


def _commit_out(commit: Commit, codes: list[str]) -> dict:
    data = commit.model_dump()
    data["short_sha"] = commit.sha[:8]
    data["requirement_codes"] = codes
    return data


@router.get("/repositories")
def list_repositories(
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    statement = select(Repository)
    if project_id is not None:
        statement = statement.where(Repository.project_id == project_id)
    return session.exec(statement.order_by(Repository.id)).all()


@router.post("/repositories", status_code=201)
def create_repository(
    payload: RepositoryIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_manager(user)
    if session.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail=f"Project {payload.project_id} not found")
    try:
        resolved = repo_service.validate_repository(payload.path)
    except repo_service.GitError as caught:
        raise HTTPException(status_code=400, detail=str(caught))

    repository = Repository(
        project_id=payload.project_id,
        name=payload.name.strip() or resolved.name,
        path=str(resolved),
        branch=repo_service.current_branch(resolved),
        auto_update_status=payload.auto_update_status,
    )
    session.add(repository)
    session.commit()
    session.refresh(repository)
    return repository


@router.delete("/repositories/{item_id}", status_code=204)
def delete_repository(
    item_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_manager(user)
    repository = session.get(Repository, item_id)
    if repository is None:
        raise HTTPException(status_code=404, detail=f"Repository {item_id} not found")

    commits = session.exec(select(Commit).where(Commit.repository_id == item_id)).all()
    commit_ids = [commit.id for commit in commits]
    if commit_ids:
        for link in session.exec(
            select(CommitRequirement).where(CommitRequirement.commit_id.in_(commit_ids))
        ).all():
            session.delete(link)
    for commit in commits:
        session.delete(commit)
    session.delete(repository)
    session.commit()


@router.post("/repositories/{item_id}/sync")
def sync_repository(
    item_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_manager(user)
    repository = session.get(Repository, item_id)
    if repository is None:
        raise HTTPException(status_code=404, detail=f"Repository {item_id} not found")
    try:
        return repo_service.sync_repository(session, repository)
    except repo_service.GitError as caught:
        raise HTTPException(status_code=400, detail=str(caught))


@router.get("/commits")
def list_commits(
    project_id: Optional[int] = None,
    requirement_id: Optional[int] = None,
    linked_only: bool = False,
    limit: int = 100,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if requirement_id is not None:
        rows = repo_service.commits_for_requirement(session, requirement_id)
    else:
        statement = select(Commit)
        if project_id is not None:
            statement = statement.where(Commit.project_id == project_id)
        rows = session.exec(statement.order_by(Commit.committed_at.desc())).all()

    links = session.exec(select(CommitRequirement)).all()
    requirements = {
        requirement.id: requirement.req_code
        for requirement in session.exec(select(Requirement)).all()
    }
    codes_by_commit: dict[int, list[str]] = {}
    for link in links:
        code = requirements.get(link.requirement_id)
        if code:
            codes_by_commit.setdefault(link.commit_id, []).append(code)

    out = []
    for commit in rows:
        codes = sorted(codes_by_commit.get(commit.id, []))
        if linked_only and not codes:
            continue
        out.append(_commit_out(commit, codes))
    return out[: max(limit, 1)]


@router.get("/requirements/{item_id}/commits")
def requirement_commits(
    item_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    requirement = session.get(Requirement, item_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail=f"Requirement {item_id} not found")
    return [
        _commit_out(commit, [requirement.req_code])
        for commit in repo_service.commits_for_requirement(session, item_id)
    ]

@router.patch("/repositories/{item_id}")
def update_repository(
    item_id: int,
    payload: RepositoryUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_manager(user)
    repository = session.get(Repository, item_id)
    if repository is None:
        raise HTTPException(status_code=404, detail=f"Repository {item_id} not found")
    if payload.name is not None:
        repository.name = payload.name.strip() or repository.name
    if payload.auto_update_status is not None:
        repository.auto_update_status = payload.auto_update_status
    session.add(repository)
    session.commit()
    session.refresh(repository)
    return repository


@router.get("/evidence")
def evidence(
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Where recorded status and committed code disagree. Read-only."""
    if project_id is None:
        first = session.exec(select(Project).order_by(Project.id)).first()
        project_id = first.id if first else 0
    return repo_service.evidence_report(session, project_id)


class ApplyIn(BaseModel):
    requirement_id: int
    status: str


@router.post("/evidence/apply")
def apply_evidence(
    payload: ApplyIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """The manual counterpart to auto-advance: a person accepts one suggestion."""
    _require_manager(user)
    requirement = session.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(
            status_code=404, detail=f"Requirement {payload.requirement_id} not found"
        )
    previous = requirement.status.value
    if previous == payload.status:
        return requirement

    requirement.status = payload.status
    requirement.version += 1
    session.add(requirement)
    session.add(
        RequirementVersion(
            requirement_id=requirement.id,
            version=requirement.version,
            changed_by=user.id,
            summary=f"status: {previous} -> {payload.status} (accepted from commit evidence)",
        )
    )
    session.commit()
    session.refresh(requirement)
    return requirement
