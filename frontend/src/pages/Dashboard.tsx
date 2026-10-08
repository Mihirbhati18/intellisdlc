import {
  Bug as BugIcon,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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

import type { DashboardData, TraceabilityMatrix } from "../api";
import { Badge, Card, ErrorBox, Loading, PageHeader, ProgressBar } from "../components/ui";
import { useProject } from "../project";
import { useFetch } from "../useFetch";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#f59e0b",
  HIGH: "#fb923c",
  CRITICAL: "#e11d48",
};

const STATUS_COLORS: Record<string, string> = {
  TODO: "#cbd5e1",
  IN_PROGRESS: "#6366f1",
  REVIEW: "#8b5cf6",
  DONE: "#10b981",
  BLOCKED: "#e11d48",
};

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "text-indigo-600",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={tone}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const { projectId } = useProject();
  const dashboard = useFetch<DashboardData>(
    projectId ? `/dashboard?project_id=${projectId}` : null,
  );
  const matrix = useFetch<TraceabilityMatrix>(
    projectId ? `/traceability?project_id=${projectId}` : null,
  );

  if (dashboard.loading) return <Loading label="Loading dashboard" />;
  if (dashboard.error) return <ErrorBox message={dashboard.error} onRetry={dashboard.reload} />;
  if (!dashboard.data) return null;

  const { counts, tasks_by_status, bugs_by_severity, active_sprint } = dashboard.data;
  const summary = matrix.data?.summary;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          active_sprint
            ? `${active_sprint.name} is active and ends on ${active_sprint.end_date}`
            : "No sprint is currently active"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Requirements"
          value={counts.requirements}
          sub={`${counts.sprints} sprints planned`}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <Kpi
          label="Task completion"
          value={`${counts.completion_pct}%`}
          sub={`${counts.tasks_done} of ${counts.tasks} tasks done`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="text-emerald-600"
        />
        <Kpi
          label="Open bugs"
          value={counts.open_bugs}
          sub={`${counts.critical_bugs} critical`}
          icon={<BugIcon className="h-4 w-4" />}
          tone="text-rose-600"
        />
        <Kpi
          label="Tests"
          value={`${counts.tests_passed}/${counts.test_cases}`}
          sub={`${counts.tests_failed} failing`}
          icon={<FlaskConical className="h-4 w-4" />}
          tone="text-sky-600"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Tasks by status">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasks_by_status} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(value: string) => value.replace("_", " ")}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {tasks_by_status.map((point) => (
                    <Cell key={point.name} fill={STATUS_COLORS[point.name] ?? "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Bugs by severity">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bugs_by_severity}
                margin={{ top: 5, right: 10, bottom: 5, left: -20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {bugs_by_severity.map((point) => (
                    <Cell key={point.name} fill={SEVERITY_COLORS[point.name] ?? "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Traceability summary">
          {matrix.loading ? (
            <Loading label="Reading the matrix" />
          ) : matrix.error ? (
            <ErrorBox message={matrix.error} onRetry={matrix.reload} />
          ) : summary ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Average coverage</span>
                <span className="font-semibold text-slate-900">{summary.avg_coverage_pct}%</span>
              </div>
              <ProgressBar value={summary.avg_coverage_pct} />
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-emerald-50 py-3">
                  <p className="text-lg font-semibold text-emerald-700">{summary.complete}</p>
                  <p className="text-xs text-emerald-600">Complete</p>
                </div>
                <div className="rounded-lg bg-rose-50 py-3">
                  <p className="text-lg font-semibold text-rose-700">{summary.at_risk}</p>
                  <p className="text-xs text-rose-600">At risk</p>
                </div>
                <div className="rounded-lg bg-amber-50 py-3">
                  <p className="text-lg font-semibold text-amber-700">{summary.incomplete}</p>
                  <p className="text-xs text-amber-600">Incomplete</p>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                {summary.without_tests} requirements still have no test cases.{" "}
                <Link to="/traceability" className="font-medium text-indigo-600 hover:underline">
                  Open the full matrix
                </Link>
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Active sprint">
          {active_sprint ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{active_sprint.name}</p>
                <Badge value={active_sprint.status} />
              </div>
              <p className="text-sm text-slate-500">{active_sprint.goal}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Starts</dt>
                  <dd className="text-slate-700">{active_sprint.start_date}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Ends</dt>
                  <dd className="text-slate-700">{active_sprint.end_date}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Deployments</dt>
                  <dd className="text-slate-700">{counts.deployments}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Open bugs</dt>
                  <dd className="text-slate-700">{counts.open_bugs}</dd>
                </div>
              </dl>
              <div className="flex gap-2 pt-1">
                <Link
                  to={`/sprints/${active_sprint.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Rocket className="h-4 w-4" />
                  Open board
                </Link>
                <Link
                  to="/risk"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Predict risk
                </Link>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">No sprint is active.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
