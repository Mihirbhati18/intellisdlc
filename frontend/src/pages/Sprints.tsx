import { CalendarDays, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, errorMessage, type Sprint, type Task } from "../api";
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
import { useFetch } from "../useFetch";

function today(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function Sprints() {
  const { isManager } = useAuth();
  const sprints = useFetch<Sprint[]>("/sprints");
  const tasks = useFetch<Task[]>("/tasks");

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    name: "",
    goal: "",
    sprint_number: (sprints.data?.length ?? 0) + 1,
    start_date: today(),
    end_date: today(14),
    status: "PLANNED",
  });

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/sprints", { ...form, project_id: 1 });
      setCreating(false);
      sprints.reload();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (sprints.loading) return <Loading label="Loading sprints" />;
  if (sprints.error) return <ErrorBox message={sprints.error} onRetry={sprints.reload} />;

  const rows = sprints.data ?? [];
  const allTasks = tasks.data ?? [];

  return (
    <div>
      <PageHeader
        title="Sprints"
        subtitle="Open a sprint to work its board"
        actions={
          isManager ? (
            <Button
              onClick={() => {
                setForm({
                  name: "",
                  goal: "",
                  sprint_number: rows.length + 1,
                  start_date: today(),
                  end_date: today(14),
                  status: "PLANNED",
                });
                setSaveError("");
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New sprint
            </Button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No sprints yet" hint="Create the first sprint to start planning." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((sprint) => {
            const sprintTasks = allTasks.filter((task) => task.sprint_id === sprint.id);
            const done = sprintTasks.filter((task) => task.status === "DONE").length;
            const pct = sprintTasks.length
              ? Math.round((100 * done) / sprintTasks.length)
              : 0;
            return (
              <Link
                key={sprint.id}
                to={`/sprints/${sprint.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{sprint.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Sprint {sprint.sprint_number}</p>
                  </div>
                  <Badge value={sprint.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-500">{sprint.goal}</p>
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {done}/{sprintTasks.length} tasks done
                    </span>
                    <span className="font-medium text-slate-700">{pct}%</span>
                  </div>
                  <ProgressBar
                    value={pct}
                    tone={pct === 100 ? "emerald" : sprint.status === "ACTIVE" ? "indigo" : "amber"}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {sprint.start_date} to {sprint.end_date}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-indigo-500" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="New sprint"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          }
        >
          <Field label="Name">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Goal">
            <textarea
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
              rows={2}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sprint number">
              <input
                type="number"
                value={form.sprint_number}
                onChange={(event) =>
                  setForm({ ...form, sprint_number: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={[
                  { value: "PLANNED", label: "Planned" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "COMPLETED", label: "Completed" },
                ]}
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={form.end_date}
                onChange={(event) => setForm({ ...form, end_date: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
