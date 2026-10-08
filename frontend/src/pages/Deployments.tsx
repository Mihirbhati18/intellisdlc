import { Plus, Rocket } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, errorMessage, type Deployment } from "../api";
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
} from "../components/ui";
import { useFetch, useLookups } from "../useFetch";

const ENVIRONMENTS = ["DEV", "STAGING", "PRODUCTION"] as const;

export function Deployments() {
  const { isManager } = useAuth();
  const { data, loading, error, reload } = useFetch<Deployment[]>("/deployments");
  const { requirements, sprints, reqCode, sprintName } = useLookups();

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    version: "",
    environment: "DEV",
    status: "SUCCESS",
    sprint_id: "",
    requirement_ids: [] as number[],
  });

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/deployments", {
        project_id: 1,
        version: form.version,
        environment: form.environment,
        status: form.status,
        sprint_id: form.sprint_id ? Number(form.sprint_id) : null,
        requirement_ids: form.requirement_ids,
      });
      setCreating(false);
      reload();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function toggleRequirement(id: number) {
    setForm((previous) => ({
      ...previous,
      requirement_ids: previous.requirement_ids.includes(id)
        ? previous.requirement_ids.filter((value) => value !== id)
        : [...previous.requirement_ids, id],
    }));
  }

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Deployments"
        subtitle="Releases grouped by environment, each carrying the requirements it shipped"
        actions={
          isManager ? (
            <Button
              onClick={() => {
                setForm({
                  version: "",
                  environment: "DEV",
                  status: "SUCCESS",
                  sprint_id: "",
                  requirement_ids: [],
                });
                setSaveError("");
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New deployment
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Loading label="Loading deployments" />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState message="Nothing has been deployed yet" />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {ENVIRONMENTS.map((environment) => {
            const envRows = rows.filter((row) => row.environment === environment);
            return (
              <Card
                key={environment}
                title={environment}
                actions={
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {envRows.length}
                  </span>
                }
              >
                {envRows.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No releases in this environment
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {envRows.map((deployment) => (
                      <li
                        key={deployment.id}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                            <Rocket className="h-3.5 w-3.5 text-slate-400" />
                            {deployment.version}
                          </span>
                          <Badge value={deployment.status} />
                        </div>
                        <p className="mt-1.5 text-xs text-slate-400">
                          {sprintName(deployment.sprint_id)} -{" "}
                          {new Date(deployment.created_at).toLocaleDateString()}
                        </p>
                        {deployment.requirement_ids.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {deployment.requirement_ids.map((id) => (
                              <Link
                                key={id}
                                to={`/requirements/${id}`}
                                className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                {reqCode(id)}
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="New deployment"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !form.version.trim()}>
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version">
              <input
                value={form.version}
                onChange={(event) => setForm({ ...form, version: event.target.value })}
                placeholder="v1.4.0"
                className={inputClass}
              />
            </Field>
            <Field label="Environment">
              <Select
                value={form.environment}
                onChange={(value) => setForm({ ...form, environment: value })}
                options={ENVIRONMENTS.map((environment) => ({
                  value: environment,
                  label: environment,
                }))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={[
                  { value: "SUCCESS", label: "Success" },
                  { value: "FAILED", label: "Failed" },
                  { value: "PENDING", label: "Pending" },
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

          <Field label="Requirements in this release">
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {requirements.map((requirement) => (
                <label
                  key={requirement.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={form.requirement_ids.includes(requirement.id)}
                    onChange={() => toggleRequirement(requirement.id)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span className="font-medium text-slate-700">{requirement.req_code}</span>
                  <span className="truncate text-slate-500">{requirement.title}</span>
                </label>
              ))}
            </div>
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
