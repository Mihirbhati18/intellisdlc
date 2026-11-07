# Design decisions

Why IntelliSDLC is built the way it is. Each entry: what was chosen, the alternatives, and why.

## 1. SQLite instead of PostgreSQL
- **Chosen:** SQLite through SQLModel.
- **Alternatives:** PostgreSQL (the original SRS plan), MySQL.
- **Why:** the app had to run on any laptop with no setup, no server and no internet. SQLModel keeps the models database-agnostic, so moving to PostgreSQL later is a connection-string change.

## 2. Logistic regression for sprint risk
- **Chosen:** scikit-learn `LogisticRegression` in a `StandardScaler` pipeline.
- **Alternatives:** random forest, gradient boosting, a hand-written rule score.
- **Why:** a project manager needs to know *why* a sprint is risky, not just a number. Logistic regression gives one coefficient per feature, so each prediction can list its top drivers and pair each with a suggested action. Accuracy was secondary to explainability.

## 3. Synthetic training data, stated openly
- **Chosen:** 2,000 generated sprints with a known risk formula plus noise (`backend/ml/train_model.py`).
- **Alternatives:** a public dataset (none matched these features), or no ML at all.
- **Why:** no real labelled sprint history was available. Generating data with a documented process keeps the model honest and reproducible (fixed seed). Held-out results: accuracy 0.735, F1 0.71 on 400 test rows. With real project history, the same pipeline would simply be retrained.

## 4. Traceability derived from links, never stored
- **Chosen:** the matrix (Designed / Implemented / Tested / Bugs / Deployed) is computed from database relationships on every request.
- **Alternatives:** storing a status per requirement and updating it by hand.
- **Why:** a stored status drifts from reality. Deriving it means the matrix can never disagree with the actual tasks, tests, bugs and deployments.

## 5. AI chat with an offline fallback
- **Chosen:** Gemini when an API key is set, otherwise a built-in rule-based agent. Project data is redacted (emails, keys) before it is used as context.
- **Alternatives:** require an API key (the SRS planned Claude or OpenAI).
- **Why:** a demo or grader must never fail because of a missing key or no internet. Redaction keeps personal data out of any external API.

## 6. Git integration: manual by default, one automatic transition only
- **Chosen:** syncing a repository only *reports* status-vs-commit disagreements unless automatic mode is switched on, and automatic mode only moves a requirement to `IN_DEVELOPMENT`.
- **Alternatives:** fully automatic status updates from commits.
- **Why:** a commit proves work started, not that it passed tests or shipped, so nothing is ever auto-marked `TESTED` or `DEPLOYED`. Only a requirement code in the commit *subject* counts as work; a mention in the body is recorded but never treated as evidence.

## 7. Role-based permissions enforced on the server
- **Chosen:** four roles (ADMIN, PROJECT_MANAGER, DEVELOPER, QA_ENGINEER) checked in the API, not just hidden in the UI.
- **Why:** hiding a button is not security. Developers can only update their own tasks; QA owns bugs and test cases; only ADMIN/PM can run the risk predictor.

## Differences from the SRS
The SRS (`docs/IntelliSDLC_SRS_and_WBS.pdf`) was written before the build. The implementation changed PostgreSQL → SQLite (decision 1), Claude/OpenAI → Gemini with an offline mode (decision 5), and left out Docker packaging to keep setup to two commands.
