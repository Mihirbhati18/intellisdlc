"""Tests for the git integration.

These build a real throwaway repository with real commits rather than faking
`git log` output, so the parsing is exercised against git's actual formatting.
"""
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

TEST_DB = Path(tempfile.gettempdir()) / "intellisdlc_repo_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["GEMINI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import repository as repo_service  # noqa: E402

API = "/api/v1"
PASSWORD = "Demo@123"


def git(args: list[str], cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def sample_repo(tmp_path_factory):
    """A tiny repository whose commits mention real and unknown requirement codes."""
    path = tmp_path_factory.mktemp("sample-repo")
    git(["init", "-b", "main"], path)
    git(["config", "user.email", "dev@example.test"], path)
    git(["config", "user.name", "Test Developer"], path)

    (path / "auth.py").write_text("# login\n", encoding="utf-8")
    git(["add", "."], path)
    git(["commit", "-m", "REQ-101 add the login endpoint"], path)

    (path / "pay.py").write_text("# payments\n", encoding="utf-8")
    git(["add", "."], path)
    git(["commit", "-m", "REQ-103 payment client\n\nAlso touches req-101 for the token."], path)

    (path / "README.md").write_text("# sample\n", encoding="utf-8")
    git(["add", "."], path)
    git(["commit", "-m", "Tidy the readme"], path)

    (path / "ghost.py").write_text("# nothing\n", encoding="utf-8")
    git(["add", "."], path)
    git(["commit", "-m", "REQ-999 work for a requirement that does not exist here"], path)
    return path


def auth(client, email: str) -> dict:
    response = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# ------------------------------------------------------------ code parsing
def test_requirement_codes_are_found_and_normalised():
    found = repo_service.extract_requirement_codes("REQ-103 fix, see req-101 and REQ-103 again")
    assert found == ["REQ-103", "REQ-101"]


def test_messages_without_codes_link_nothing():
    assert repo_service.extract_requirement_codes("Tidy the readme") == []
    assert repo_service.extract_requirement_codes("") == []
    assert repo_service.extract_requirement_codes("REQUEST-5 is not a code") == []


# -------------------------------------------------------------- validation
def test_a_plain_folder_is_rejected(tmp_path):
    with pytest.raises(repo_service.GitError):
        repo_service.validate_repository(str(tmp_path))


def test_a_missing_folder_is_rejected():
    with pytest.raises(repo_service.GitError) as caught:
        repo_service.validate_repository(r"Z:\definitely\not\here")
    assert "No such folder" in str(caught.value)


def test_an_empty_path_is_rejected():
    with pytest.raises(repo_service.GitError):
        repo_service.validate_repository("   ")


def test_a_real_repository_is_accepted(sample_repo):
    assert repo_service.validate_repository(str(sample_repo)) == sample_repo.resolve()


def test_commits_are_read_newest_first(sample_repo):
    commits = repo_service.read_commits(sample_repo)
    assert len(commits) == 4
    assert commits[0]["subject"].startswith("REQ-999")
    assert commits[-1]["subject"] == "REQ-101 add the login endpoint"
    assert commits[-1]["author_name"] == "Test Developer"


# -------------------------------------------------------------- the API
def test_developer_cannot_connect_a_repository(client, sample_repo):
    response = client.post(
        f"{API}/repositories",
        headers=auth(client, "kabir@intellisdlc.dev"),
        json={"project_id": 1, "name": "sample", "path": str(sample_repo)},
    )
    assert response.status_code == 403


def test_connecting_a_non_repository_explains_why(client, tmp_path):
    response = client.post(
        f"{API}/repositories",
        headers=auth(client, "pm@intellisdlc.dev"),
        json={"project_id": 1, "name": "nope", "path": str(tmp_path)},
    )
    assert response.status_code == 400
    assert "not a git repository" in response.json()["detail"]


def test_sync_reads_commits_and_links_them(client, sample_repo):
    headers = auth(client, "pm@intellisdlc.dev")

    created = client.post(
        f"{API}/repositories",
        headers=headers,
        json={"project_id": 1, "name": "sample", "path": str(sample_repo)},
    )
    assert created.status_code == 201
    repository_id = created.json()["id"]

    result = client.post(f"{API}/repositories/{repository_id}/sync", headers=headers)
    assert result.status_code == 200
    body = result.json()

    assert body["commits_read"] == 4
    assert body["commits_added"] == 4
    # REQ-101 twice (two commits name it) and REQ-103 once.
    assert body["links_written"] == 3
    assert body["unmatched_codes"] == ["REQ-999"]
    assert body["branch"] == "main"

    # Syncing again must not duplicate anything.
    again = client.post(f"{API}/repositories/{repository_id}/sync", headers=headers).json()
    assert again["commits_added"] == 0
    assert again["commits_total"] == 4
    assert again["links_written"] == 3


def test_commits_appear_against_the_requirement(client):
    headers = auth(client, "pm@intellisdlc.dev")
    requirements = client.get(f"{API}/requirements?project_id=1", headers=headers).json()
    login = next(r for r in requirements if r["req_code"] == "REQ-101")
    payments = next(r for r in requirements if r["req_code"] == "REQ-103")

    login_commits = client.get(f"{API}/requirements/{login['id']}/commits", headers=headers).json()
    assert len(login_commits) == 2

    payment_commits = client.get(
        f"{API}/requirements/{payments['id']}/commits", headers=headers
    ).json()
    assert len(payment_commits) == 1
    assert payment_commits[0]["subject"].startswith("REQ-103")
    assert len(payment_commits[0]["short_sha"]) == 8


def test_unlinked_commits_can_be_filtered_out(client):
    headers = auth(client, "pm@intellisdlc.dev")
    everything = client.get(f"{API}/commits?project_id=1", headers=headers).json()
    linked = client.get(f"{API}/commits?project_id=1&linked_only=true", headers=headers).json()
    assert len(everything) == 4
    # Two commits carry links, though they write three links between them:
    # one message names both REQ-103 and REQ-101.
    assert len(linked) == 2
    assert all(commit["requirement_codes"] for commit in linked)
    both = next(c for c in linked if len(c["requirement_codes"]) == 2)
    assert sorted(both["requirement_codes"]) == ["REQ-101", "REQ-103"]


def test_traceability_reports_commit_evidence(client):
    headers = auth(client, "pm@intellisdlc.dev")
    matrix = client.get(f"{API}/traceability?project_id=1", headers=headers).json()
    commits = {row["req_code"]: row["commits"] for row in matrix["rows"]}

    assert commits["REQ-101"] == 2
    assert commits["REQ-103"] == 1
    assert commits["REQ-108"] == 0
    assert matrix["summary"]["with_commits"] == 2

    # The verdicts must not have moved: evidence sits beside the task view.
    overall = {row["req_code"]: row["overall"] for row in matrix["rows"]}
    assert overall["REQ-101"] == "COMPLETE"
    assert overall["REQ-103"] == "AT_RISK"
    assert overall["REQ-106"] == "INCOMPLETE"


def test_disconnecting_removes_the_commits(client, sample_repo):
    headers = auth(client, "pm@intellisdlc.dev")
    repositories = client.get(f"{API}/repositories?project_id=1", headers=headers).json()
    target = next(r for r in repositories if r["path"] == str(sample_repo.resolve()))

    assert client.delete(f"{API}/repositories/{target['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/commits?project_id=1", headers=headers).json() == []

    matrix = client.get(f"{API}/traceability?project_id=1", headers=headers).json()
    assert matrix["summary"]["with_commits"] == 0
