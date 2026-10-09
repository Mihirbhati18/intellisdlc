import { GitBranch, GitCommitHorizontal, Link2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  errorMessage,
  type Commit,
  type Repository,
  type SyncResult,
} from "../api";
import { useAuth } from "../auth";
import { useProject } from "../project";
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  inputClass,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";
import { useFetch, useLookups } from "../useFetch";

function when(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Code() {
  const { isManager } = useAuth();
  const { projectId } = useProject();
  const { requirements } = useLookups();

  const repositories = useFetch<Repository[]>(
    projectId ? `/repositories?project_id=${projectId}` : null,
  );
  const commits = useFetch<Commit[]>(
    projectId ? `/commits?project_id=${projectId}&limit=100` : null,
  );

  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState({ name: "", path: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncError, setSyncError] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);

  const repos = repositories.data ?? [];
  const rows = commits.data ?? [];
  const linked = rows.filter((commit) => commit.requirement_codes.length > 0);
  const codeByRequirement = new Map(
    requirements.map((requirement) => [requirement.req_code, requirement.id]),
  );

  async function connect() {
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/repositories", {
        project_id: projectId,
        name: form.name,
        path: form.path,
      });
      setConnecting(false);
      repositories.reload();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function sync(repository: Repository) {
    setSyncing(repository.id);
    setSyncError("");
    setResult(null);
    try {
      const response = await api.post<SyncResult>(`/repositories/${repository.id}/sync`);
      setResult(response.data);
      repositories.reload();
      commits.reload();
    } catch (caught) {
      setSyncError(errorMessage(caught));
    } finally {
      setSyncing(null);
    }
  }

  async function disconnect(repository: Repository) {
    setSyncError("");
    try {
      await api.delete(`/repositories/${repository.id}`);
      setResult(null);
      repositories.reload();
      commits.reload();
    } catch (caught) {
      setSyncError(errorMessage(caught));
    }
  }

  return (
    <div>
      <PageHeader
        title="Code"
        subtitle="Real commits read from a git folder on disk, linked to requirements by code"
        actions={
          isManager && repos.length === 0 ? (
            <Button
              onClick={() => {
                setForm({ name: "", path: "" });
                setSaveError("");
                setConnecting(true);
              }}
            >
              <Plug className="h-4 w-4" />
              Connect repository
            </Button>
          ) : undefined
        }
      />

      {repositories.loading ? (
        <Loading label="Loading repositories" />
      ) : repositories.error ? (
        <ErrorBox message={repositories.error} onRetry={repositories.reload} />
      ) : repos.length === 0 ? (
        <Card>
          <EmptyState
            message="No repository connected"
            hint={
              isManager
                ? "Point this project at a git folder to replace ticked boxes with merged commits."
                : "Ask a project manager to connect one."
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {repos.map((repository) => (
            <Card key={repository.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{repository.name}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-slate-400">
                    {repository.path}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {repository.branch && (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3.5 w-3.5" />
                        {repository.branch}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <GitCommitHorizontal className="h-3.5 w-3.5" />
                      {repository.commit_count} commits stored
                    </span>
                    <span>
                      {repository.last_synced_at
                        ? `Last synced ${when(repository.last_synced_at)}`
                        : "Never synced"}
                    </span>
                  </div>
                </div>
                {isManager && (
                  <div className="flex items-center gap-2">
                    <Button onClick={() => void sync(repository)} disabled={syncing !== null}>
                      <RefreshCw
                        className={`h-4 w-4 ${syncing === repository.id ? "animate-spin" : ""}`}
                      />
                      {syncing === repository.id ? "Reading git" : "Sync"}
                    </Button>
                    <Button variant="secondary" onClick={() => void disconnect(repository)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {syncError && <p className="mt-3 text-sm text-rose-600">{syncError}</p>}

              {result && result.repository_id === repository.id && (
                <div className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-lg font-semibold text-emerald-800">
                      {result.commits_read}
                    </p>
                    <p className="text-xs text-emerald-700">commits read</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-emerald-800">
                      {result.commits_added}
                    </p>
                    <p className="text-xs text-emerald-700">newly stored</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-emerald-800">
                      {result.links_written}
                    </p>
                    <p className="text-xs text-emerald-700">requirement links</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-emerald-800">{result.branch}</p>
                    <p className="text-xs text-emerald-700">branch</p>
                  </div>
                  {result.unmatched_codes.length > 0 && (
                    <p className="text-xs text-emerald-700 sm:col-span-4">
                      Mentioned but not in this project:{" "}
                      {result.unmatched_codes.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}

          <Card
            title="Commits"
            actions={
              <span className="font-mono text-xs text-slate-400">
                {linked.length} of {rows.length} linked
              </span>
            }
          >
            {commits.loading ? (
              <Loading label="Loading commits" />
            ) : rows.length === 0 ? (
              <EmptyState
                message="No commits read yet"
                hint="Press Sync to read the repository's history."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((commit) => (
                  <li key={commit.id} className="flex gap-3 py-3">
                    <span className="mt-0.5 font-mono text-xs text-slate-400">
                      {commit.short_sha}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{commit.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {commit.author_name} &middot; {when(commit.committed_at)}
                      </p>
                      {commit.requirement_codes.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Link2 className="h-3 w-3 text-slate-300" />
                          {commit.requirement_codes.map((code) => {
                            const id = codeByRequirement.get(code);
                            return id ? (
                              <Link
                                key={code}
                                to={`/requirements/${id}`}
                                className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                {code}
                              </Link>
                            ) : (
                              <span key={code} className="font-mono text-xs text-slate-400">
                                {code}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="How linking works">
            <p className="text-sm text-slate-600">
              A commit is linked to a requirement when its message names the code. Writing{" "}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                REQ-103 add refund handling
              </span>{" "}
              links that commit to REQ-103 on the next sync. One commit can name several
              requirements, and syncing again rebuilds the links, so correcting a message fixes the
              record.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Nothing is pushed or written to the repository &mdash; IntelliSDLC only reads{" "}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">git log</span>.
            </p>
          </Card>
        </div>
      )}

      {connecting && (
        <Modal
          title="Connect a repository"
          onClose={() => setConnecting(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConnecting(false)}>
                Cancel
              </Button>
              <Button onClick={() => void connect()} disabled={saving || !form.path.trim()}>
                {saving ? "Checking" : "Connect"}
              </Button>
            </>
          }
        >
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            A folder on this machine that is already a git working copy. It is only ever read.
          </p>
          <Field label="Folder path">
            <input
              value={form.path}
              onChange={(event) => setForm({ ...form, path: event.target.value })}
              placeholder="D:\\MyProjects\\my-app"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
          <Field label="Display name">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="my-app"
              className={inputClass}
            />
          </Field>
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        </Modal>
      )}
    </div>
  );
}
