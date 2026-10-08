"""Smoke and behaviour tests for IntelliSDLC.

Runs against a throwaway SQLite file so the demo database is never touched.
The temporary path must be in the environment before `app.config` is imported,
which is why the os.environ line comes before the app imports.

Run from the backend folder:  pytest -q
"""
import os
import tempfile
from pathlib import Path

import pytest

TEST_DB = Path(tempfile.gettempdir()) / "intellisdlc_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["GEMINI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import agent  # noqa: E402

API = "/api/v1"
PASSWORD = "Demo@123"


@pytest.fixture(scope="module")
def client():
    # Entering the context manager runs the lifespan, which creates the tables,
    # seeds the demo project and loads the risk model.
    with TestClient(app) as test_client:
        yield test_client


def token(client: TestClient, email: str) -> str:
    response = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(client: TestClient, email: str) -> dict:
    return {"Authorization": f"Bearer {token(client, email)}"}


def requirement_by_code(client: TestClient, headers: dict, code: str) -> dict:
    rows = client.get(f"{API}/requirements", headers=headers).json()
    match = next(row for row in rows if row["req_code"] == code)
    return match


def sprint_by_number(client: TestClient, headers: dict, number: int) -> dict:
    rows = client.get(f"{API}/sprints", headers=headers).json()
    return next(row for row in rows if row["sprint_number"] == number)


# --------------------------------------------------------------------- auth
def test_health_and_seed(client):
    body = client.get(f"{API}/health").json()
    assert body["status"] == "ok"
    assert body["risk_model_loaded"] is True
    assert body["ai_mode"] == "offline"


def test_login_succeeds(client):
    response = client.post(
        f"{API}/auth/login", json={"email": "pm@intellisdlc.dev", "password": PASSWORD}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "PROJECT_MANAGER"
    assert "password_hash" not in body["user"]


def test_login_with_wrong_password_is_401(client):
    response = client.post(
        f"{API}/auth/login", json={"email": "pm@intellisdlc.dev", "password": "nope"}
    )
    assert response.status_code == 401


def test_request_without_token_is_401(client):
    assert client.get(f"{API}/requirements").status_code == 401


# -------------------------------------------------------------- permissions
def test_developer_cannot_create_a_requirement(client):
    headers = auth(client, "kabir@intellisdlc.dev")
    response = client.post(
        f"{API}/requirements",
        headers=headers,
        json={"project_id": 1, "title": "Should be rejected"},
    )
    assert response.status_code == 403


def test_developer_cannot_run_the_risk_predictor(client):
    headers = auth(client, "kabir@intellisdlc.dev")
    sprint = sprint_by_number(client, headers, 3)
    response = client.post(
        f"{API}/ai/predict-risk", headers=headers, json={"sprint_id": sprint["id"]}
    )
    assert response.status_code == 403


# ----------------------------------------------------------- versioning rule
def test_editing_a_requirement_creates_a_version_row(client):
    headers = auth(client, "pm@intellisdlc.dev")
    # REQ-107 is deliberately not one of the requirements the traceability
    # assertions below pin down.
    requirement = requirement_by_code(client, headers, "REQ-107")
    before = requirement["version"]
    history_before = client.get(
        f"{API}/requirements/{requirement['id']}/history", headers=headers
    ).json()

    response = client.patch(
        f"{API}/requirements/{requirement['id']}", headers=headers, json={"priority": "CRITICAL"}
    )
    assert response.status_code == 200
    assert response.json()["version"] == before + 1

    history_after = client.get(
        f"{API}/requirements/{requirement['id']}/history", headers=headers
    ).json()
    assert len(history_after) == len(history_before) + 1
    assert "MEDIUM -> CRITICAL" in history_after[0]["summary"]


def test_task_moving_to_done_sets_completed_at(client):
    headers = auth(client, "pm@intellisdlc.dev")
    sprint = sprint_by_number(client, headers, 3)
    tasks = client.get(f"{API}/tasks?sprint_id={sprint['id']}", headers=headers).json()
    task = next(row for row in tasks if row["status"] != "DONE")
    assert task["completed_at"] is None

    done = client.patch(f"{API}/tasks/{task['id']}", headers=headers, json={"status": "DONE"})
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None

    # Put it back so the risk assertions below still see the seeded sprint.
    reverted = client.patch(
        f"{API}/tasks/{task['id']}", headers=headers, json={"status": task["status"]}
    )
    assert reverted.json()["completed_at"] is None


# ------------------------------------------------------------- traceability
def test_traceability_matches_the_expected_demo_outcomes(client):
    headers = auth(client, "pm@intellisdlc.dev")
    matrix = client.get(f"{API}/traceability?project_id=1", headers=headers).json()
    overall = {row["req_code"]: row["overall"] for row in matrix["rows"]}

    assert overall["REQ-101"] == "COMPLETE"
    assert overall["REQ-103"] == "AT_RISK"
    assert overall["REQ-106"] == "INCOMPLETE"


def test_traceability_stage_detail(client):
    headers = auth(client, "pm@intellisdlc.dev")
    matrix = client.get(f"{API}/traceability?project_id=1", headers=headers).json()
    rows = {row["req_code"]: row for row in matrix["rows"]}

    # REQ-101 shipped: designed, built, tested, no open bugs, in production.
    assert rows["REQ-101"]["designed"] == "DONE"
    assert rows["REQ-101"]["implemented"] == "DONE"
    assert rows["REQ-101"]["tested"] == "PASSED"
    assert rows["REQ-101"]["deployed"] == "PRODUCTION"
    assert rows["REQ-101"]["coverage_pct"] == 100

    # REQ-103 is at risk: a failing test and two critical open bugs.
    assert rows["REQ-103"]["tested"] == "FAILED"
    assert rows["REQ-103"]["critical_open_bugs"] == 2

    # REQ-106 has no test coverage at all.
    assert rows["REQ-106"]["tested"] == "NO_TESTS"
    assert rows["REQ-106"]["test_count"] == 0
    assert matrix["summary"]["without_tests"] >= 2


# ---------------------------------------------------------------------- risk
def test_sprint_three_is_high_risk_and_sprint_four_is_low(client):
    headers = auth(client, "pm@intellisdlc.dev")

    third = sprint_by_number(client, headers, 3)
    response = client.post(
        f"{API}/ai/predict-risk", headers=headers, json={"sprint_id": third["id"]}
    )
    assert response.status_code == 200
    high = response.json()
    assert high["risk_level"] == "HIGH"
    assert high["risk_score"] >= 70
    assert high["features"]["critical_bugs_count"] == 2
    assert len(high["drivers"]) >= 1
    assert all(driver["action"] for driver in high["drivers"])

    fourth = sprint_by_number(client, headers, 4)
    low = client.post(
        f"{API}/ai/predict-risk", headers=headers, json={"sprint_id": fourth["id"]}
    ).json()
    assert low["risk_level"] == "LOW"
    assert low["risk_score"] < 40


def test_risk_prediction_is_saved(client):
    headers = auth(client, "pm@intellisdlc.dev")
    sprint = sprint_by_number(client, headers, 3)
    client.post(f"{API}/ai/predict-risk", headers=headers, json={"sprint_id": sprint["id"]})
    history = client.get(f"{API}/ai/risk-history?sprint_id={sprint['id']}", headers=headers).json()
    assert len(history) >= 1
    assert history[0]["risk_level"] == "HIGH"


def test_risk_for_an_unknown_sprint_is_404(client):
    headers = auth(client, "pm@intellisdlc.dev")
    response = client.post(f"{API}/ai/predict-risk", headers=headers, json={"sprint_id": 9999})
    assert response.status_code == 404


# ----------------------------------------------------------------- redaction
def test_sanitize_drops_secrets_and_masks_emails():
    raw = {
        "user": {
            "full_name": "Priya Nair",
            "email": "pm@intellisdlc.dev",
            "password_hash": "$2b$12$abcdefghijklmnopqrstuv",
            "api_key": "AIzaSyFAKEKEYFORTESTS12345",
        },
        "notes": ["contact kabir@intellisdlc.dev about AIzaSyFAKEKEYFORTESTS12345"],
    }
    clean = agent.sanitize_context(raw)

    assert "password_hash" not in clean["user"]
    assert "api_key" not in clean["user"]
    assert clean["user"]["email"] == "p***@intellisdlc.dev"
    assert "kabir@intellisdlc.dev" not in clean["notes"][0]
    assert "AIzaSyFAKEKEYFORTESTS12345" not in clean["notes"][0]
    assert "[redacted]" in clean["notes"][0]


def test_agent_context_never_carries_password_hashes(client):
    headers = auth(client, "pm@intellisdlc.dev")
    assert client.get(f"{API}/users", headers=headers).status_code == 200

    from sqlmodel import Session

    from app.database import engine

    with Session(engine) as session:
        context = agent.retrieve_project_context(session, 1, "TASKS")
    assert "password_hash" not in str(agent.sanitize_context(context))


# --------------------------------------------------------------------- agent
def test_question_classification():
    assert agent.classify_question("Which critical bugs are still open?") == "BUGS"
    assert agent.classify_question("Who is overloaded this sprint?") == "TASKS"
    assert agent.classify_question("What is the risk of the active sprint?") == "RISK"
    assert agent.classify_question("Which requirements have no test cases?") == "TESTS"
    assert agent.classify_question("Hello there") == "GENERAL"


def test_agent_offline_mode_answers_from_project_data(client):
    headers = auth(client, "pm@intellisdlc.dev")
    response = client.post(
        f"{API}/ai/agent",
        headers=headers,
        json={"project_id": 1, "question": "Which critical bugs are still open?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "offline"
    assert body["category"] == "BUGS"
    assert "BUG-101" in body["answer"]
    assert "BUG-101" in body["sources"]


def test_agent_names_requirements_without_tests(client):
    headers = auth(client, "pm@intellisdlc.dev")
    body = client.post(
        f"{API}/ai/agent",
        headers=headers,
        json={"project_id": 1, "question": "Which requirements have no test cases?"},
    ).json()
    assert "REQ-106" in body["answer"]


def test_agent_rejects_an_empty_question(client):
    headers = auth(client, "pm@intellisdlc.dev")
    body = client.post(
        f"{API}/ai/agent", headers=headers, json={"project_id": 1, "question": "   "}
    ).json()
    assert "Please ask a question" in body["answer"]


# ----------------------------------------------------------- qa permissions
def test_qa_can_add_a_test_case_and_developer_cannot(client):
    qa_headers = auth(client, "qa@intellisdlc.dev")
    dev_headers = auth(client, "kabir@intellisdlc.dev")
    requirement = requirement_by_code(client, qa_headers, "REQ-106")

    created = client.post(
        f"{API}/test-cases",
        headers=qa_headers,
        json={
            "requirement_id": requirement["id"],
            "title": "Submit a product review",
            "expected_result": "The review appears on the product page",
            "status": "PASSED",
        },
    )
    assert created.status_code == 201
    assert created.json()["test_code"].startswith("TC-")

    rejected = client.post(
        f"{API}/test-cases",
        headers=dev_headers,
        json={"requirement_id": requirement["id"], "title": "Not allowed"},
    )
    assert rejected.status_code == 403

    # Clean up so the traceability expectations stay reproducible in any order.
    assert (
        client.delete(f"{API}/test-cases/{created.json()['id']}", headers=qa_headers).status_code
        == 204
    )


def test_developer_can_only_move_their_own_task(client):
    dev_headers = auth(client, "diya@intellisdlc.dev")
    me = client.get(f"{API}/auth/me", headers=dev_headers).json()
    tasks = client.get(f"{API}/tasks", headers=dev_headers).json()

    someone_else = next(
        row for row in tasks if row["assigned_to"] not in (None, me["id"])
    )
    assert (
        client.patch(
            f"{API}/tasks/{someone_else['id']}", headers=dev_headers, json={"status": "DONE"}
        ).status_code
        == 403
    )

    own = next(row for row in tasks if row["assigned_to"] == me["id"] and row["status"] != "DONE")
    assert (
        client.patch(
            f"{API}/tasks/{own['id']}", headers=dev_headers, json={"title": "renamed"}
        ).status_code
        == 403
    )
    moved = client.patch(
        f"{API}/tasks/{own['id']}", headers=dev_headers, json={"status": "IN_PROGRESS"}
    )
    assert moved.status_code == 200
    client.patch(f"{API}/tasks/{own['id']}", headers=dev_headers, json={"status": own["status"]})
