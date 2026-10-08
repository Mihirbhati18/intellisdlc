import { ArrowLeft, Clock, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  api,
  errorMessage,
  type Sprint,
  type Task,
  type TaskStatus,
} from "../api";
import { useAuth } from "../auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  inputClass,
  Loading,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
} from "../components/ui";
import { useFetch, useLookups } from "../useFetch";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "REVIEW", label: "Review" },
  { status: "DONE", label: "Done" },
  { status: "BLOCKED", label: "Blocked" },
];

const STATUS_OPTIONS = COLUMNS.map((column) => ({
  value: column.status,
  label: column.label,
}));

export function SprintBoard() {
  const { id } = useParams<{ id: string }>();
  const { user, isManager } = useAuth();
  const sprint = useFetch<Sprint>(`/sprints/${id}`);
  const tasks = useFetch<Task[]>(`/tasks?sprint_id=${id}`);
  const { users, requirements, userName, reqCode } = useLookups();

  const [rowError, setRowError] = useState("");
  const [busyTask, setBusyTask] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    title: "",
    task_type: "DEVELOPMENT",
    estimate_hours: 8,
    status: "TODO",
    assigned_to: "",
    requirement_id: "",
  });

  const [logging, setLogging] = useState<Task | null>(null);
  const [logHours, setLogHours] = useState(2);

  async function changeStatus(task: Task, status: string) {
    setBusyTask(task.id);
    setRowError("");
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      tasks.reload();
    } catch (caught) {
      setRowError(errorMessage(caught));
    } finally {
      setBusyTask(null);
    }
  }

  async function createTask() {
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/tasks", {
        title: form.title,
        task_type: form.task_type,
        estimate_hours: Number(form.estimate_hours),
        status: form.status,
        sprint_id: Number(id),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        requirement_id: form.requirement_id ? Number(form.requirement_id) : null,
      });
      setCreating(false);
      tasks.reload();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveTimeLog() {
    if (!logging) return;
    setSaving(true);
    setSaveError("");
    try {
      await api.post(`/tasks/${logging.id}/time-logs`, { hours: Number(logHours) });
      setLogging(null);
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (sprint.loading) return <Loading label="Loading sprint" />;
  if (sprint.error) return <ErrorBox message={sprint.error} onRetry={sprint.reload} />;
  if (!sprint.data) return null;

  const rows = tasks.data ?? [];
  const done = rows.filter((task) => task.status === "DONE").length;
  const pct = rows.length ? Math.round((100 * done) / rows.length) : 0;

  function canEdit(task: Task): boolean {
    if (isManager) return true;
    return user?.role === "DEVELOPER" && task.assigned_to === user.id;
  }

  return (
    <div>
      <Link
        to="/sprints"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" />
        All sprints
      </Link>

      <PageHeader
        title={sprint.data.name}
        subtitle={`${sprint.data.goal} - ${sprint.data.start_date} to ${sprint.data.end_date}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge value={sprint.data.status} />
            {isManager && (
              <Button
                onClick={() => {
                  setForm({
                    title: "",
                    task_type: "DEVELOPMENT",
                    estimate_hours: 8,
                    status: "TODO",
                    assigned_to: "",
                    requirement_id: "",
                  });
                  setSaveError("");
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New task
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {done} of {rows.length} tasks done
          </span>
          <span className="font-semibold text-slate-900">{pct}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar value={pct} tone={pct === 100 ? "emerald" : "indigo"} />
        </div>
      </Card>

      {rowError && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {rowError}
        </p>
      )}

      {tasks.loading ? (
        <Loading label="Loading tasks" />
      ) : tasks.error ? (
        <ErrorBox message={tasks.error} onRetry={tasks.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState message="This sprint has no tasks yet" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnTasks = rows.filter((task) => task.status === column.status);
            return (
              <div key={column.status} className="rounded-xl bg-slate-200/50 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {column.label}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {columnTasks.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-slate-400">Nothing here</p>
                  )}
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <p className="text-sm font-medium text-slate-800">{task.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge value={task.task_type} />
                        <span className="text-xs text-slate-400">{task.estimate_hours}h</span>
                        {task.requirement_id && (
                          <Link
                            to={`/requirements/${task.requirement_id}`}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            {reqCode(task.requirement_id)}
                          </Link>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{userName(task.assigned_to)}</p>
                      {canEdit(task) ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Select
                            value={task.status}
                            onChange={(value) => void changeStatus(task, value)}
                            options={STATUS_OPTIONS}
                            className="!py-1 text-xs"
                          />
                          <button
                            onClick={() => {
                              setLogHours(2);
                              setSaveError("");
                              setLogging(task);
                            }}
                            title="Log time"
                            className="shrink-0 rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-300">Read only</p>
                      )}
                      {busyTask === task.id && (
                        <p className="mt-1 text-xs text-indigo-500">Saving...</p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="New task"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createTask()} disabled={saving || !form.title.trim()}>
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          }
        >
          <Field label="Title">
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.task_type}
                onChange={(value) => setForm({ ...form, task_type: value })}
                options={[
                  { value: "DESIGN", label: "Design" },
                  { value: "DEVELOPMENT", label: "Development" },
                  { value: "TESTING", label: "Testing" },
                ]}
              />
            </Field>
            <Field label="Estimate (hours)">
              <input
                type="number"
                value={form.estimate_hours}
                onChange={(event) =>
                  setForm({ ...form, estimate_hours: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Field label="Assignee">
              <Select
                value={form.assigned_to}
                onChange={(value) => setForm({ ...form, assigned_to: value })}
                options={[
                  { value: "", label: "Unassigned" },
                  ...users.map((member) => ({
                    value: String(member.id),
                    label: member.full_name,
                  })),
                ]}
              />
            </Field>
          </div>
          <Field label="Requirement">
            <Select
              value={form.requirement_id}
              onChange={(value) => setForm({ ...form, requirement_id: value })}
              options={[
                { value: "", label: "Not linked" },
                ...requirements.map((requirement) => ({
                  value: String(requirement.id),
                  label: `${requirement.req_code} - ${requirement.title}`,
                })),
              ]}
            />
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}

      {logging && (
        <Modal
          title={`Log time on "${logging.title}"`}
          onClose={() => setLogging(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setLogging(null)}>
                Cancel
              </Button>
              <Button onClick={() => void saveTimeLog()} disabled={saving || logHours <= 0}>
                {saving ? "Saving" : "Log time"}
              </Button>
            </>
          }
        >
          <Field label="Hours">
            <input
              type="number"
              step="0.5"
              value={logHours}
              onChange={(event) => setLogHours(Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
