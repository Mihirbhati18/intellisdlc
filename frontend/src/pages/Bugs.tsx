import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  errorMessage,
  type Bug,
  type BugStatus,
  type Priority,
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
  Select,
  Table,
} from "../components/ui";
import { useFetch, useLookups } from "../useFetch";

const SEVERITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const BUG_STATUSES: BugStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "RETEST",
  "CLOSED",
  "REOPENED",
];

interface FormState {
  title: string;
  severity: Priority;
  status: BugStatus;
  requirement_id: string;
  sprint_id: string;
  assignee_id: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  severity: "MEDIUM",
  status: "OPEN",
  requirement_id: "",
  sprint_id: "",
  assignee_id: "",
};

export function Bugs() {
  const { user, isManager } = useAuth();
  const canEdit = isManager || user?.role === "QA_ENGINEER";
  const { data, loading, error, reload } = useFetch<Bug[]>("/bugs");
  const { users, requirements, sprints, userName, reqCode } = useLookups();

  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editing, setEditing] = useState<Bug | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    return all.filter(
      (bug) =>
        (!severityFilter || bug.severity === severityFilter) &&
        (!statusFilter || bug.status === statusFilter),
    );
  }, [data, severityFilter, statusFilter]);

  function openEdit(bug: Bug) {
    setForm({
      title: bug.title,
      severity: bug.severity,
      status: bug.status,
      requirement_id: bug.requirement_id ? String(bug.requirement_id) : "",
      sprint_id: bug.sprint_id ? String(bug.sprint_id) : "",
      assignee_id: bug.assignee_id ? String(bug.assignee_id) : "",
    });
    setSaveError("");
    setEditing(bug);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        title: form.title,
        severity: form.severity,
        status: form.status,
        requirement_id: form.requirement_id ? Number(form.requirement_id) : null,
        sprint_id: form.sprint_id ? Number(form.sprint_id) : null,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      };
      if (editing) {
        await api.patch(`/bugs/${editing.id}`, payload);
      } else {
        await api.post("/bugs", { ...payload, project_id: 1 });
      }
      setEditing(null);
      setCreating(false);
      reload();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Bugs"
        subtitle="Defects linked back to the requirement and sprint they belong to"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setForm(EMPTY_FORM);
                setSaveError("");
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Report bug
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Select
            value={severityFilter}
            onChange={setSeverityFilter}
            className="sm:max-w-[11rem]"
            options={[
              { value: "", label: "All severities" },
              ...SEVERITIES.map((severity) => ({ value: severity, label: severity })),
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="sm:max-w-[12rem]"
            options={[
              { value: "", label: "All statuses" },
              ...BUG_STATUSES.map((status) => ({
                value: status,
                label: status.replaceAll("_", " "),
              })),
            ]}
          />
        </div>

        {loading ? (
          <Loading label="Loading bugs" />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState message="No bugs match these filters" />
        ) : (
          <Table head={["Code", "Title", "Requirement", "Severity", "Status", "Assignee", ""]}>
            {rows.map((bug) => (
              <tr key={bug.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                  {bug.bug_code}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{bug.title}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {bug.requirement_id ? (
                    <Link
                      to={`/requirements/${bug.requirement_id}`}
                      className="text-sm font-medium text-indigo-600 hover:underline"
                    >
                      {reqCode(bug.requirement_id)}
                    </Link>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={bug.severity} />
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={bug.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                  {userName(bug.assignee_id)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canEdit && (
                    <button
                      onClick={() => openEdit(bug)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {(creating || editing) && (
        <Modal
          title={editing ? `Edit ${editing.bug_code}` : "Report a bug"}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !form.title.trim()}>
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
            <Field label="Severity">
              <Select
                value={form.severity}
                onChange={(value) => setForm({ ...form, severity: value as Priority })}
                options={SEVERITIES.map((severity) => ({ value: severity, label: severity }))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as BugStatus })}
                options={BUG_STATUSES.map((status) => ({
                  value: status,
                  label: status.replaceAll("_", " "),
                }))}
              />
            </Field>
            <Field label="Requirement">
              <Select
                value={form.requirement_id}
                onChange={(value) => setForm({ ...form, requirement_id: value })}
                options={[
                  { value: "", label: "Not linked" },
                  ...requirements.map((requirement) => ({
                    value: String(requirement.id),
                    label: requirement.req_code,
                  })),
                ]}
              />
            </Field>
            <Field label="Sprint">
              <Select
                value={form.sprint_id}
                onChange={(value) => setForm({ ...form, sprint_id: value })}
                options={[
                  { value: "", label: "Not linked" },
                  ...sprints.map((sprint) => ({
                    value: String(sprint.id),
                    label: sprint.name,
                  })),
                ]}
              />
            </Field>
          </div>
          <Field label="Assignee">
            <Select
              value={form.assignee_id}
              onChange={(value) => setForm({ ...form, assignee_id: value })}
              options={[
                { value: "", label: "Unassigned" },
                ...users.map((member) => ({
                  value: String(member.id),
                  label: member.full_name,
                })),
              ]}
            />
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
