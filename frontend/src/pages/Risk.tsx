import { Activity, Lightbulb, ShieldAlert } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  api,
  errorMessage,
  type ModelMetrics,
  type RiskResult,
  type Sprint,
} from "../api";
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Loading,
  PageHeader,
  Select,
  Table,
} from "../components/ui";
import { useProject } from "../project";
import { useFetch } from "../useFetch";

const LEVEL_STYLES: Record<string, { ring: string; text: string; bar: string; label: string }> = {
  LOW: {
    ring: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-700",
    bar: "#10b981",
    label: "On track",
  },
  MEDIUM: {
    ring: "border-amber-200 bg-amber-50",
    text: "text-amber-700",
    bar: "#f59e0b",
    label: "Needs attention",
  },
  HIGH: {
    ring: "border-rose-200 bg-rose-50",
    text: "text-rose-700",
    bar: "#e11d48",
    label: "Likely to slip",
  },
};

const FEATURE_LABELS: Record<string, string> = {
  open_bugs_count: "Open bugs",
  critical_bugs_count: "Critical bugs",
  build_failure_rate: "Build failure rate",
  requirement_changes_count: "Requirement changes",
  avg_developer_load: "Avg developer load",
  missed_deadlines_last_sprint: "Carried over last sprint",
  days_remaining: "Days remaining",
  total_tasks: "Total tasks",
  completed_tasks: "Completed tasks",
  completion_ratio: "Completion ratio",
};

export function Risk() {
  const { projectId } = useProject();
  const sprints = useFetch<Sprint[]>(
    projectId ? `/sprints?project_id=${projectId}` : null,
  );
  const metrics = useFetch<ModelMetrics>("/ai/model-metrics");

  const [sprintId, setSprintId] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const rows = sprints.data ?? [];
  const selected = sprintId || (rows.find((sprint) => sprint.status === "ACTIVE")?.id ?? rows[0]?.id);

  async function predict() {
    if (!selected) return;
    setRunning(true);
    setRunError("");
    try {
      const response = await api.post<RiskResult>("/ai/predict-risk", {
        sprint_id: Number(selected),
      });
      setResult(response.data);
    } catch (caught) {
      setRunError(errorMessage(caught));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  if (sprints.loading) return <Loading label="Loading sprints" />;
  if (sprints.error) return <ErrorBox message={sprints.error} onRetry={sprints.reload} />;

  const style = result ? LEVEL_STYLES[result.risk_level] : null;
  const driverData = (result?.drivers ?? []).map((driver) => ({
    name: driver.label,
    value: Number(driver.contribution.toFixed(3)),
  }));

  return (
    <div>
      <PageHeader
        title="Sprint Risk Predictor"
        subtitle="Logistic regression over live sprint metrics, with the drivers behind the score"
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Sprint">
              <Select
                value={String(selected ?? "")}
                onChange={setSprintId}
                options={rows.map((sprint) => ({
                  value: String(sprint.id),
                  label: `${sprint.name} (${sprint.status})`,
                }))}
              />
            </Field>
          </div>
          <Button onClick={() => void predict()} disabled={running || !selected}>
            <Activity className="h-4 w-4" />
            {running ? "Scoring" : "Predict risk"}
          </Button>
        </div>
        {runError && <p className="mt-3 text-sm text-rose-600">{runError}</p>}
      </Card>

      {!result && !running && (
        <Card>
          <EmptyState
            message="No prediction yet"
            hint="Pick a sprint and run the predictor to see the score and its drivers."
          />
        </Card>
      )}

      {running && <Loading label="Running the model" />}

      {result && style && (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className={`rounded-xl border p-6 text-center ${style.ring}`}>
              <ShieldAlert className={`mx-auto h-6 w-6 ${style.text}`} />
              <p className={`mt-3 text-4xl font-bold ${style.text}`}>{result.risk_score}</p>
              <p className={`mt-1 text-sm font-semibold ${style.text}`}>
                {result.risk_level} RISK
              </p>
              <p className="mt-1 text-xs text-slate-500">{style.label}</p>
              <p className="mt-3 text-xs text-slate-400">{result.sprint_name}</p>
            </div>

            <Card title="Top risk drivers" className="lg:col-span-2">
              {driverData.length === 0 ? (
                <EmptyState message="Nothing is pushing this sprint towards risk" />
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={driverData}
                      layout="vertical"
                      margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {driverData.map((point) => (
                          <Cell key={point.name} fill={style.bar} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card title="Suggested actions">
              <ul className="space-y-3">
                {result.drivers.map((driver) => (
                  <li key={driver.feature} className="flex gap-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-sm text-slate-700">{driver.text}</p>
                      <p className="mt-0.5 text-sm font-medium text-slate-900">{driver.action}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Live sprint metrics">
              <Table head={["Metric", "Value"]}>
                {Object.entries(result.features).map(([key, value]) => (
                  <tr key={key}>
                    <td className="px-3 py-2 text-slate-600">{FEATURE_LABELS[key] ?? key}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{value}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}

      <Card title="Model" className="mt-5">
        {metrics.loading ? (
          <Loading label="Loading metrics" />
        ) : metrics.error ? (
          <ErrorBox message={metrics.error} onRetry={metrics.reload} />
        ) : metrics.data ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {metrics.data.model} trained on {metrics.data.rows} synthetic sprints.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Accuracy", metrics.data.accuracy],
                ["Precision", metrics.data.precision],
                ["Recall", metrics.data.recall],
                ["F1", metrics.data.f1],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-lg font-semibold text-slate-900">{String(value)}</p>
                  <p className="text-xs text-slate-400">{String(label)}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                Confusion matrix (test set)
              </p>
              <div className="inline-grid grid-cols-2 gap-1 text-center text-sm">
                {metrics.data.confusion_matrix.flat().map((value, index) => (
                  <span
                    key={index}
                    className="min-w-[3.5rem] rounded bg-slate-100 px-3 py-1.5 font-medium text-slate-700"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
