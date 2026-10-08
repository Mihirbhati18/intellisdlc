import { Check, FolderPlus, Pencil } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, errorMessage, type Project } from "../api";
import { useAuth } from "../auth";
import { useProject } from "../project";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  Loading,
  Modal,
  PageHeader,
  Select,
  Table,
} from "../components/ui";

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"];

const EMPTY_FORM = { name: "", description: "", status: "ACTIVE" };

export function Projects() {
  const { isManager } = useAuth();
  const { projects, projectId, setProjectId, reloadProjects, loading } = useProject();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function openCreate() {
    setForm(EMPTY_FORM);
    setSaveError("");
    setCreating(true);
  }

  function openEdit(project: Project) {
    setForm({
      name: project.name,
      description: project.description,
      status: project.status,
    });
    setSaveError("");
    setEditing(project);
  }

  function close() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      if (editing) {
        await api.patch(`/projects/${editing.id}`, form);
        reloadProjects();
        close();
      } else {
        const response = await api.post<Project>("/projects", form);
        reloadProjects();
        // A brand new project is almost certainly the one you want to work in.
        setProjectId(response.data.id);
        close();
        navigate("/");
      }
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Every requirement, sprint, bug and release belongs to one project"
        actions={
          isManager ? (
            <Button onClick={openCreate}>
              <FolderPlus className="h-4 w-4" />
              New project
            </Button>
          ) : undefined
        }
      />

      <Card>
        {loading ? (
          <Loading label="Loading projects" />
        ) : projects.length === 0 ? (
          <EmptyState
            message="No projects yet"
            hint={
              isManager
                ? "Create one to start tracking requirements and sprints."
                : "Ask a project manager to create one."
            }
          />
        ) : (
          <Table head={["Name", "Description", "Status", "", ""]}>
            {projects.map((project) => {
              const open = project.id === projectId;
              return (
                <tr key={project.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                    {project.name}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{project.description}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={project.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {open ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                        Open
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setProjectId(project.id);
                          navigate("/");
                        }}
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        Switch to this
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {isManager && (
                      <button
                        onClick={() => openEdit(project)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {(creating || editing) && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "New project"}
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
                {saving ? "Saving" : editing ? "Save" : "Create and open"}
              </Button>
            </>
          }
        >
          {!editing && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              The new project starts empty. You will add its requirements, sprints and team work
              from the usual pages once it is open.
            </p>
          )}
          <Field label="Name">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Campus Placement Portal"
              className={inputClass}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              placeholder="What this project delivers"
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={STATUSES.map((status) => ({
                value: status,
                label: status.replaceAll("_", " "),
              }))}
            />
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
