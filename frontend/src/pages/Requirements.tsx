import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  errorMessage,
  type Priority,
  type Requirement,
  type RequirementStatus,
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

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: RequirementStatus[] = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "IN_DEVELOPMENT",
  "TESTED",
  "DEPLOYED",
  "REJECTED",
];

interface FormState {
  title: string;
  description: string;
  type: "FUNCTIONAL" | "NON_FUNCTIONAL";
  priority: Priority;
  status: RequirementStatus;
  design_reference: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  type: "FUNCTIONAL",
  priority: "MEDIUM",
  status: "DRAFT",
  design_reference: "",
};

export function Requirements() {
  const { isManager } = useAuth();
  const { data, loading, error, reload } = useFetch<Requirement[]>("/requirements");
  const { userName } = useLookups();

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Requirement | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const all = data ?? [];
    return all.filter(
      (requirement) =>
        (!statusFilter || requirement.status === statusFilter) &&
        (!priorityFilter || requirement.priority === priorityFilter) &&
        (!search ||
          requirement.title.toLowerCase().includes(search.toLowerCase()) ||
          requirement.req_code.toLowerCase().includes(search.toLowerCase())),
    );
  }, [data, statusFilter, priorityFilter, search]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setSaveError("");
    setCreating(true);
  }

  function openEdit(requirement: Requirement) {
    setForm({
      title: requirement.title,
      description: requirement.description,
      type: requirement.type,
      priority: requirement.priority,
      status: requirement.status,
      design_reference: requirement.design_reference ?? "",
    });
    setSaveError("");
    setEditing(requirement);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ...form,
        design_reference: form.design_reference.trim() || null,
      };
      if (editing) {
        await api.patch(`/requirements/${editing.id}`, payload);
      } else {
        await api.post("/requirements", { ...payload, project_id: 1 });
      }
      closeModal();
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
        title="Requirements"
        subtitle="Every requirement links forward to design, code, tests and releases"
        actions={
          isManager ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New requirement
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            placeholder="Search by code or title"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`${inputClass} sm:max-w-xs`}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="sm:max-w-[12rem]"
            options={[
              { value: "", label: "All statuses" },
              ...STATUSES.map((status) => ({ value: status, label: status.replaceAll("_", " ") })),
            ]}
          />
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            className="sm:max-w-[11rem]"
            options={[
              { value: "", label: "All priorities" },
              ...PRIORITIES.map((priority) => ({ value: priority, label: priority })),
            ]}
          />
        </div>

        {loading ? (
          <Loading label="Loading requirements" />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            message="No requirements match these filters"
            hint="Clear the filters or add a new requirement."
          />
        ) : (
          <Table head={["Code", "Title", "Type", "Priority", "Status", "Owner", "Ver", ""]}>
            {rows.map((requirement) => (
              <tr key={requirement.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                  <Link to={`/requirements/${requirement.id}`} className="hover:text-indigo-600">
                    {requirement.req_code}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    to={`/requirements/${requirement.id}`}
                    className="text-slate-700 hover:text-indigo-600"
                  >
                    {requirement.title}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={requirement.type} />
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={requirement.priority} />
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={requirement.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                  {userName(requirement.owner_id)}
                </td>
                <td className="px-3 py-2.5 text-slate-500">v{requirement.version}</td>
                <td className="px-3 py-2.5 text-right">
                  {isManager && (
                    <button
                      onClick={() => openEdit(requirement)}
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
          title={editing ? `Edit ${editing.req_code}` : "New requirement"}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !form.title.trim()}>
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          }
        >
          {editing && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Changing the title, description, priority or status creates a new version entry.
            </p>
          )}
          <Field label="Title">
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(value) =>
                  setForm({ ...form, type: value as FormState["type"] })
                }
                options={[
                  { value: "FUNCTIONAL", label: "Functional" },
                  { value: "NON_FUNCTIONAL", label: "Non functional" },
                ]}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(value) => setForm({ ...form, priority: value as Priority })}
                options={PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as RequirementStatus })}
                options={STATUSES.map((status) => ({
                  value: status,
                  label: status.replaceAll("_", " "),
                }))}
              />
            </Field>
            <Field label="Design reference">
              <input
                value={form.design_reference}
                onChange={(event) => setForm({ ...form, design_reference: event.target.value })}
                placeholder="DS-101 ..."
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
