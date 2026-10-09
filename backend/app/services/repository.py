"""Read a local git working copy and link its commits to requirements.

The point of this service is to replace a self-reported signal with a measured
one: "implemented" stops meaning "somebody ticked a box" and starts meaning
"these commits reference this requirement".

Everything runs against a folder on disk with the `git` binary, so it needs no
network, no API token and no account - the project keeps working offline.

Safety: git is invoked with an argument list and an explicit working directory,
never a shell string, so a repository path cannot inject a command. Only ADMIN
and PROJECT_MANAGER can register a path in the first place.
"""
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlmodel import Session, select

from ..models import Commit, CommitRequirement, Repository, Requirement

# Commit messages opt in by naming a requirement: "REQ-103 add refund handling".
REQUIREMENT_CODE_RE = re.compile(r"\b(REQ-\d+)\b", re.IGNORECASE)

# Field and record separators that will not appear in a commit message.
FIELD_SEP = "\x1f"
RECORD_SEP = "\x1e"

GIT_TIMEOUT_SECONDS = 30
MAX_COMMITS = 500


class GitError(RuntimeError):
    """Raised when the folder is not usable as a git repository."""


def _run_git(args: list[str], cwd: Path) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
            shell=False,
        )
    except FileNotFoundError as exc:
        raise GitError("git is not installed or not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise GitError("git took too long to respond") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip().splitlines()
        raise GitError(detail[0] if detail else "git command failed")
    return completed.stdout


def validate_repository(path_text: str) -> Path:
    """Return the resolved path, or explain why it cannot be used."""
    cleaned = (path_text or "").strip().strip('"')
    if not cleaned:
        raise GitError("Enter the folder that holds the repository")
    path = Path(cleaned).expanduser()
    if not path.exists():
        raise GitError(f"No such folder: {path}")
    if not path.is_dir():
        raise GitError(f"Not a folder: {path}")
    # Confirms it is a work tree rather than just a directory containing .git.
    inside = _run_git(["rev-parse", "--is-inside-work-tree"], path).strip()
    if inside != "true":
        raise GitError(f"{path} is not a git repository")
    return path.resolve()


def current_branch(path: Path) -> str:
    try:
        return _run_git(["rev-parse", "--abbrev-ref", "HEAD"], path).strip()
    except GitError:
        return ""


def extract_requirement_codes(message: str) -> list[str]:
    """Every REQ code mentioned, upper-cased and de-duplicated, in order."""
    seen: list[str] = []
    for match in REQUIREMENT_CODE_RE.findall(message or ""):
        code = match.upper()
        if code not in seen:
            seen.append(code)
    return seen


def read_commits(path: Path, limit: int = MAX_COMMITS) -> list[dict]:
    """Newest first. Merge commits are skipped - they carry no authored work."""
    pretty = FIELD_SEP.join(["%H", "%an", "%ae", "%aI", "%s", "%b"]) + RECORD_SEP
    output = _run_git(
        ["log", "--no-merges", f"--max-count={limit}", f"--pretty=format:{pretty}"],
        path,
    )

    commits: list[dict] = []
    for raw in output.split(RECORD_SEP):
        record = raw.strip("\n")
        if not record.strip():
            continue
        parts = record.split(FIELD_SEP)
        if len(parts) < 5:
            continue
        sha, author_name, author_email, committed_at, subject = parts[:5]
        body = parts[5] if len(parts) > 5 else ""
        try:
            when = datetime.fromisoformat(committed_at.strip())
        except ValueError:
            continue
        commits.append(
            {
                "sha": sha.strip(),
                "author_name": author_name.strip(),
                "author_email": author_email.strip(),
                "committed_at": when.replace(tzinfo=None),
                "subject": subject.strip(),
                "body": body.strip(),
            }
        )
    return commits


def sync_repository(session: Session, repository: Repository) -> dict:
    """Pull commits in from disk and (re)link them to requirements.

    Safe to run repeatedly: commits already stored are left alone and only
    newly seen shas are inserted, but links are rebuilt so that renaming a
    requirement code is picked up on the next sync.
    """
    path = validate_repository(repository.path)
    commits = read_commits(path)

    requirement_by_code = {
        requirement.req_code.upper(): requirement
        for requirement in session.exec(
            select(Requirement).where(Requirement.project_id == repository.project_id)
        ).all()
    }

    existing = {
        commit.sha: commit
        for commit in session.exec(
            select(Commit).where(Commit.repository_id == repository.id)
        ).all()
    }

    added = 0
    linked = 0
    unmatched_codes: set[str] = set()

    for data in commits:
        commit = existing.get(data["sha"])
        if commit is None:
            commit = Commit(
                repository_id=repository.id,
                project_id=repository.project_id,
                sha=data["sha"],
                author_name=data["author_name"],
                author_email=data["author_email"],
                committed_at=data["committed_at"],
                subject=data["subject"],
                body=data["body"],
            )
            session.add(commit)
            session.commit()
            session.refresh(commit)
            existing[commit.sha] = commit
            added += 1

        for link in session.exec(
            select(CommitRequirement).where(CommitRequirement.commit_id == commit.id)
        ).all():
            session.delete(link)

        for code in extract_requirement_codes(f"{data['subject']} {data['body']}"):
            requirement = requirement_by_code.get(code)
            if requirement is None:
                unmatched_codes.add(code)
                continue
            session.add(
                CommitRequirement(commit_id=commit.id, requirement_id=requirement.id)
            )
            linked += 1
    session.commit()

    repository.branch = current_branch(path)
    repository.last_synced_at = datetime.utcnow()
    repository.commit_count = len(existing)
    session.add(repository)
    session.commit()
    session.refresh(repository)

    return {
        "repository_id": repository.id,
        "branch": repository.branch,
        "commits_read": len(commits),
        "commits_added": added,
        "commits_total": len(existing),
        "links_written": linked,
        "unmatched_codes": sorted(unmatched_codes),
        "last_synced_at": repository.last_synced_at,
    }


def commit_counts_by_requirement(session: Session, project_id: int) -> dict[int, int]:
    """How many commits reference each requirement, for the traceability matrix."""
    commit_ids = session.exec(
        select(Commit.id).where(Commit.project_id == project_id)
    ).all()
    if not commit_ids:
        return {}
    counts: dict[int, int] = {}
    for link in session.exec(
        select(CommitRequirement).where(CommitRequirement.commit_id.in_(list(commit_ids)))
    ).all():
        counts[link.requirement_id] = counts.get(link.requirement_id, 0) + 1
    return counts


def commits_for_requirement(
    session: Session, requirement_id: int, limit: Optional[int] = None
) -> list[Commit]:
    commit_ids = session.exec(
        select(CommitRequirement.commit_id).where(
            CommitRequirement.requirement_id == requirement_id
        )
    ).all()
    if not commit_ids:
        return []
    statement = (
        select(Commit)
        .where(Commit.id.in_(list(commit_ids)))
        .order_by(Commit.committed_at.desc())
    )
    rows = session.exec(statement).all()
    return rows[:limit] if limit else rows
