"""Manual versus automatic status updates from commit evidence.

Two paths exist on purpose. Manual is the default: syncing reads the repository
and reports what disagrees, but changes nothing. Automatic opts in to one
specific, provable transition - a requirement with its first commit has clearly
started - and records the commit that justified it.
"""
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

TEST_DB = Path(tempfile.gettempdir()) / "intellisdlc_modes_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["GEMINI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

API = "/api/v1"
PASSWORD = "Demo@123"


def git(args: list[str], cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)


def make_repo(path: Path, author: str, messages: list[str]) -> Path:
    git(["init", "-b", "main"], path)
    git(["config", "user.email", "dev@example.test"], path)
    git(["config", "user.name", author], path)
    for index, message in enumerate(messages):
        (path / f"file{index}.txt").write_text(f"change {index}\n", encoding="utf-8")
        git(["add", "."], path)
        git(["commit", "-m", message], path)
    return path


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth(client, email: str) -> dict:
    response = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def requirement(client, headers, code: str) -> dict:
    rows = client.get(f"{API}/requirements?project_id=1", headers=headers).json()
    return next(row for row in rows if row["req_code"] == code)


def connect(client, headers, path: Path, name: str, auto: bool = False) -> dict:
    response = client.post(
        f"{API}/repositories",
        headers=headers,
        json={
            "project_id": 1,
            "name": name,
            "path": str(path),
            "auto_update_status": auto,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(scope="module")
def work_repo(tmp_path_factory):
    """One commit that works on REQ-106, one that only mentions REQ-104."""
    return make_repo(
        tmp_path_factory.mktemp("work-repo"),
        "Aarav Mehta",
        [
            "REQ-106 add the review submission API",
            "chore: tidy imports\n\nSpotted while reading REQ-104, not working on it.",
        ],
    )


# -------------------------------------------- subject beats body as evidence
def test_subject_codes_are_work_and_body_codes_are_only_mentions(client, work_repo):
    headers = auth(client, "pm@intellisdlc.dev")
    created = connect(client, headers, work_repo, "work")
    assert created["auto_update_status"] is False, "manual must be the default"

    client.post(f"{API}/repositories/{created['id']}/sync", headers=headers)
    rows = {
        row["req_code"]: row
        for row in client.get(f"{API}/evidence?project_id=1", headers=headers).json()["rows"]
    }

    assert rows["REQ-106"]["commits"] == 1
    assert rows["REQ-106"]["primary_commits"] == 1
    # Named only in the body, so it is a mention and cannot drive a status change.
    assert rows["REQ-104"]["commits"] == 1
    assert rows["REQ-104"]["primary_commits"] == 0


# ------------------------------------------------------------- manual mode
def test_manual_sync_changes_nothing(client, work_repo):
    headers = auth(client, "pm@intellisdlc.dev")
    assert requirement(client, headers, "REQ-106")["status"] == "APPROVED"

    repositories = client.get(f"{API}/repositories?project_id=1", headers=headers).json()
    target = next(r for r in repositories if r["path"] == str(work_repo.resolve()))
    result = client.post(f"{API}/repositories/{target['id']}/sync", headers=headers).json()

    assert result["auto_update_status"] is False
    assert result["status_updates"] == []
    assert requirement(client, headers, "REQ-106")["status"] == "APPROVED"


def test_the_report_suggests_without_applying(client):
    headers = auth(client, "pm@intellisdlc.dev")
    report = client.get(f"{API}/evidence?project_id=1", headers=headers).json()
    row = next(r for r in report["rows"] if r["req_code"] == "REQ-106")

    assert row["issue"] == "STATUS_BEHIND"
    assert row["suggested_status"] == "IN_DEVELOPMENT"
    assert "still APPROVED" in row["detail"]
    assert requirement(client, headers, "REQ-106")["status"] == "APPROVED"


def test_progress_claimed_without_any_commit_is_flagged(client):
    headers = auth(client, "pm@intellisdlc.dev")
    report = client.get(f"{API}/evidence?project_id=1", headers=headers).json()
    row = next(r for r in report["rows"] if r["req_code"] == "REQ-102")

    assert row["issue"] == "NO_EVIDENCE"
    assert row["commits"] == 0
    # No suggestion: only a person can say whether the claim is true.
    assert row["suggested_status"] is None


def test_applying_a_suggestion_records_who_accepted_it(client):
    headers = auth(client, "pm@intellisdlc.dev")
    target = requirement(client, headers, "REQ-106")

    applied = client.post(
        f"{API}/evidence/apply",
        headers=headers,
        json={"requirement_id": target["id"], "status": "IN_DEVELOPMENT"},
    )
    assert applied.status_code == 200
    assert applied.json()["status"] == "IN_DEVELOPMENT"
    assert applied.json()["version"] == target["version"] + 1

    history = client.get(f"{API}/requirements/{target['id']}/history", headers=headers).json()
    assert "accepted from commit evidence" in history[0]["summary"]


def test_a_developer_cannot_apply_a_suggestion(client):
    target = requirement(client, auth(client, "pm@intellisdlc.dev"), "REQ-107")
    response = client.post(
        f"{API}/evidence/apply",
        headers=auth(client, "kabir@intellisdlc.dev"),
        json={"requirement_id": target["id"], "status": "IN_DEVELOPMENT"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------- automatic mode
def test_automatic_mode_advances_and_cites_the_commit(client, tmp_path_factory):
    headers = auth(client, "pm@intellisdlc.dev")
    assert requirement(client, headers, "REQ-108")["status"] == "UNDER_REVIEW"

    path = make_repo(
        tmp_path_factory.mktemp("auto-repo"),
        "Diya Sharma",
        ["REQ-108 send the order confirmation email"],
    )
    created = connect(client, headers, path, "auto", auto=True)
    assert created["auto_update_status"] is True

    result = client.post(f"{API}/repositories/{created['id']}/sync", headers=headers).json()
    assert len(result["status_updates"]) == 1
    update = result["status_updates"][0]
    assert update["req_code"] == "REQ-108"
    assert update["from_status"] == "UNDER_REVIEW"
    assert update["to_status"] == "IN_DEVELOPMENT"

    after = requirement(client, headers, "REQ-108")
    assert after["status"] == "IN_DEVELOPMENT"

    history = client.get(f"{API}/requirements/{after['id']}/history", headers=headers).json()
    assert "first commit" in history[0]["summary"]
    assert "Diya Sharma" in history[0]["summary"]


def test_automatic_mode_never_claims_tested_or_deployed(client, tmp_path_factory):
    """A commit proves work started. It does not prove the work passed or shipped."""
    headers = auth(client, "pm@intellisdlc.dev")
    assert requirement(client, headers, "REQ-101")["status"] == "DEPLOYED"

    path = make_repo(
        tmp_path_factory.mktemp("late-repo"),
        "Aarav Mehta",
        ["REQ-101 tweak the login copy"],
    )
    created = connect(client, headers, path, "late", auto=True)
    result = client.post(f"{API}/repositories/{created['id']}/sync", headers=headers).json()

    assert result["status_updates"] == []
    assert requirement(client, headers, "REQ-101")["status"] == "DEPLOYED"


def test_automatic_mode_ignores_body_only_mentions(client, tmp_path_factory):
    headers = auth(client, "pm@intellisdlc.dev")
    before = requirement(client, headers, "REQ-107")
    assert before["status"] == "DRAFT"

    path = make_repo(
        tmp_path_factory.mktemp("mention-repo"),
        "Kabir Singh",
        ["chore: update dependencies\n\nUnrelated to REQ-107 but worth noting."],
    )
    created = connect(client, headers, path, "mentions", auto=True)
    result = client.post(f"{API}/repositories/{created['id']}/sync", headers=headers).json()

    assert result["links_written"] == 1, "the mention is still recorded as a link"
    assert result["status_updates"] == [], "but it must not move the status"
    assert requirement(client, headers, "REQ-107")["status"] == "DRAFT"


# ----------------------------------------------------------- the toggle
def test_the_toggle_can_be_switched_after_connecting(client, work_repo):
    headers = auth(client, "pm@intellisdlc.dev")
    repositories = client.get(f"{API}/repositories?project_id=1", headers=headers).json()
    target = next(r for r in repositories if r["path"] == str(work_repo.resolve()))

    on = client.patch(
        f"{API}/repositories/{target['id']}", headers=headers, json={"auto_update_status": True}
    )
    assert on.status_code == 200
    assert on.json()["auto_update_status"] is True

    off = client.patch(
        f"{API}/repositories/{target['id']}", headers=headers, json={"auto_update_status": False}
    )
    assert off.json()["auto_update_status"] is False


def test_a_developer_cannot_change_the_toggle(client, work_repo):
    headers = auth(client, "pm@intellisdlc.dev")
    repositories = client.get(f"{API}/repositories?project_id=1", headers=headers).json()
    target = next(r for r in repositories if r["path"] == str(work_repo.resolve()))

    response = client.patch(
        f"{API}/repositories/{target['id']}",
        headers=auth(client, "kabir@intellisdlc.dev"),
        json={"auto_update_status": True},
    )
    assert response.status_code == 403
