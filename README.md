# IntelliSDLC

An SDLC management platform that links **requirements → sprints → tasks → bugs → test cases → deployments**, plus three intelligence features:

1. **Sprint Risk Predictor** — scikit-learn logistic regression over live sprint metrics, returning a 0–100 score, a LOW/MEDIUM/HIGH level, the top drivers and a suggested action for each.
2. **Traceability Matrix** — derives Designed / Implemented / Tested / Bugs / Deployed per requirement straight from the database links.
3. **AI Project Agent** — chat that answers from sanitized project data. Uses the Gemini free API when a key is set, otherwise falls back to a built-in offline mode.

Student project — Mihir Bhati.

Runs entirely locally: **no API key and no internet required.**

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLModel, SQLite, PyJWT, bcrypt, scikit-learn, joblib, pandas, httpx |
| Frontend | React, Vite, TypeScript, Tailwind CSS, React Router, Axios, Recharts, lucide-react |

Roles: `ADMIN`, `PROJECT_MANAGER`, `DEVELOPER`, `QA_ENGINEER`.

---

## Setup

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate      # macOS / Linux
pip install -r requirements.txt
copy .env.example .env           # Windows   (cp on macOS / Linux)
python ml/train_model.py         # writes ml/risk_model.pkl + ml/metrics.json
uvicorn app.main:app --reload
```

The database is created and seeded automatically on first start. API docs: <http://127.0.0.1:8000/docs>

To rebuild the demo data from scratch:

```bash
python -m app.seed --reset
```

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend on port 8000, so no CORS setup is needed.

### Optional: Gemini

Leave `GEMINI_API_KEY` empty in `backend/.env` and the AI chat runs in offline mode. Add a free key to switch it to Gemini — the AI Chat page shows which mode answered.

## Tests

```bash
cd backend
pytest -q
```

21 tests run against a temporary SQLite file, so the demo database is never touched. They cover
authentication, the role permissions, the requirement-versioning rule, the three pinned traceability
outcomes, Sprint 3 scoring HIGH and Sprint 4 LOW, context redaction, and the offline AI agent.

### Driving the UI

`tools/` holds a dependency-free headless-Chrome driver (Node's built-in WebSocket speaking the
DevTools Protocol) that clicks through every page and screenshots it. With the backend and
`npm run dev` already running:

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9222   --user-data-dir=%TEMP%/intellisdlc-chrome about:blank
node tools/drive.mjs        # 84 checks: every page, both roles, screenshots to tools/screenshots
node tools/drive-edge.mjs   # 13 checks: stale token, empty states, a QA write, read-only roles
node tools/drive-offline.mjs  # what the UI shows when the backend is down
```

---

## Demo accounts

Password for all accounts: **`Demo@123`**

| Email | Name | Role |
|---|---|---|
| `admin@intellisdlc.dev` | Mihir Bhati | ADMIN |
| `pm@intellisdlc.dev` | Priya Nair | PROJECT_MANAGER |
| `aarav@intellisdlc.dev` | Aarav Mehta | DEVELOPER |
| `diya@intellisdlc.dev` | Diya Sharma | DEVELOPER |
| `kabir@intellisdlc.dev` | Kabir Singh | DEVELOPER |
| `qa@intellisdlc.dev` | Rahul Verma | QA_ENGINEER |

The login page has one-click buttons for the main accounts.

---

## Five-minute demo

1. **Log in as the PM** (`pm@intellisdlc.dev`) using the quick-fill button.
2. **Dashboard** — KPIs, tasks by status, bugs by severity, traceability summary, active sprint.
3. **Requirements → REQ-103** — open the detail page and show the three-entry **version history** (`HIGH → CRITICAL`, then `APPROVED → IN_DEVELOPMENT`) next to its linked tasks, tests, bugs and deployments.
4. **Sprints → Sprint 3 - Payments** — the board with five status columns; change a card's status from the dropdown.
5. **Risk Predictor** — score **Sprint 3** (comes out **HIGH**, driven by two critical open bugs, a 25% completion ratio and mid-sprint requirement changes), then score **Sprint 4** (**LOW**). Compare the drivers and suggested actions.
6. **Traceability** — REQ-101 is **COMPLETE**, REQ-103 is **AT_RISK**, REQ-106 is **INCOMPLETE** with no tests at all.
7. **Test Cases** — add a test case for **REQ-106**, mark it passed, then reload Traceability to watch its coverage move.
8. **AI Chat** — ask *"Which critical bugs are still open?"* and *"Who is overloaded this sprint?"*; the badge shows Offline mode with the record IDs it used.
9. **Log out and sign in as a developer** (`kabir@intellisdlc.dev`) — the Risk Predictor disappears from the sidebar, and only Kabir's own task cards are editable.

---

## Project layout

```
backend/
  app/
    main.py config.py database.py models.py security.py seed.py
    routers/   auth.py core.py intelligence.py
    services/  traceability.py risk.py agent.py
  ml/          train_model.py risk_model.pkl metrics.json
  tests/       test_core.py
  requirements.txt .env.example
frontend/
  src/
    api.ts auth.tsx useFetch.ts App.tsx main.tsx
    components/  Layout.tsx ui.tsx
    pages/       Login Dashboard Requirements RequirementDetail
                 Sprints SprintBoard Bugs TestCases Deployments
                 Traceability Risk Chat
PROJECT_PLAN.md
```

## API summary

Base path `/api/v1`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Service status, model and AI mode |
| `POST /auth/login`, `GET /auth/me` | Authentication |
| CRUD on `/projects`, `/requirements`, `/sprints`, `/tasks`, `/bugs`, `/test-cases`, `/deployments` | Core records |
| `GET /users`, `GET /users/developers` | Team |
| `GET /requirements/{id}/history`, `/links` | Versions and forward links |
| `POST /tasks/{id}/time-logs` | Effort logging |
| `GET /dashboard` | Counts and chart data |
| `GET /traceability` | Traceability matrix |
| `POST /ai/predict-risk` | Sprint risk score, drivers, actions |
| `GET /ai/model-metrics` | Trained model metrics |
| `POST /ai/agent` | Project chat |

**Permissions:** ADMIN and PROJECT_MANAGER create and edit everything. DEVELOPER can only change the status of, and log time on, tasks assigned to them. QA_ENGINEER creates and edits bugs and test cases. The risk predictor is ADMIN/PM only. Everyone can read and use the AI chat.
