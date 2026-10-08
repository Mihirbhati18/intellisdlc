"""Train the Sprint Risk Predictor and save risk_model.pkl + metrics.json.

Run once from the backend folder:  python ml/train_model.py
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ML_DIR = Path(__file__).resolve().parent

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

# Weights of the synthetic generating process (also the story we tell in the report).
WEIGHTS = {
    "intercept": -3.2,
    "open_bugs_count": 0.35,
    "critical_bugs_count": 0.75,
    "build_failure_rate": 2.0,
    "requirement_changes_count": 0.30,
    "avg_developer_load": 1.60,
    "missed_deadlines_last_sprint": 0.25,
    "days_remaining": -0.06,
    "total_tasks": 0.02,
    "completed_tasks": 0.0,
    "completion_ratio": -2.50,
}

N_ROWS = 2000
SEED = 42


def generate_dataset(rng: np.random.Generator) -> pd.DataFrame:
    open_bugs = rng.poisson(2.5, N_ROWS).clip(0, 15)
    critical = np.minimum(rng.poisson(0.8, N_ROWS), open_bugs)
    build_failure_rate = rng.beta(2, 6, N_ROWS).round(3)
    requirement_changes = rng.poisson(2.0, N_ROWS).clip(0, 12)
    avg_load = rng.normal(0.8, 0.35, N_ROWS).clip(0.05, 2.2).round(3)
    missed = rng.poisson(2.2, N_ROWS).clip(0, 12)
    days_remaining = rng.integers(0, 22, N_ROWS)
    total_tasks = rng.integers(2, 31, N_ROWS)
    ratio = rng.uniform(0, 1, N_ROWS)
    completed_tasks = rng.binomial(total_tasks, ratio)
    completion_ratio = (completed_tasks / total_tasks).round(3)

    df = pd.DataFrame(
        {
            "open_bugs_count": open_bugs,
            "critical_bugs_count": critical,
            "build_failure_rate": build_failure_rate,
            "requirement_changes_count": requirement_changes,
            "avg_developer_load": avg_load,
            "missed_deadlines_last_sprint": missed,
            "days_remaining": days_remaining,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_ratio": completion_ratio,
        }
    )

    z = np.full(N_ROWS, WEIGHTS["intercept"], dtype=float)
    for feature in FEATURES:
        z += WEIGHTS[feature] * df[feature].to_numpy(dtype=float)
    z += rng.normal(0, 0.6, N_ROWS)
    probability = 1 / (1 + np.exp(-z))
    df["at_risk"] = rng.binomial(1, probability)
    return df


def main() -> None:
    rng = np.random.default_rng(SEED)
    np.random.seed(SEED)
    df = generate_dataset(rng)

    X = df[FEATURES]
    y = df["at_risk"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "model",
                LogisticRegression(class_weight="balanced", max_iter=1000, random_state=SEED),
            ),
        ]
    )
    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    coefficients = dict(
        zip(FEATURES, [round(float(c), 4) for c in pipeline.named_steps["model"].coef_[0]])
    )
    metrics = {
        "model": "LogisticRegression (StandardScaler pipeline)",
        "rows": int(len(df)),
        "at_risk_share": round(float(y.mean()), 4),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "features": FEATURES,
        "coefficients": coefficients,
        "random_state": SEED,
    }

    joblib.dump({"pipeline": pipeline, "features": FEATURES}, ML_DIR / "risk_model.pkl")
    (ML_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(
        "saved risk_model.pkl | accuracy="
        + str(metrics["accuracy"])
        + " f1="
        + str(metrics["f1"])
        + " at_risk_share="
        + str(metrics["at_risk_share"])
    )


if __name__ == "__main__":
    main()
