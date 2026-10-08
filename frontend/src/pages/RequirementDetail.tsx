import { ArrowLeft, History } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import type {
  Requirement,
  RequirementLinks,
  RequirementVersionRow,
} from "../api";
import { Badge, Card, EmptyState, ErrorBox, Loading, PageHeader, Table } from "../components/ui";
import { useFetch, useLookups } from "../useFetch";

export function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const requirement = useFetch<Requirement>(`/requirements/${id}`);
  const history = useFetch<RequirementVersionRow[]>(`/requirements/${id}/history`);
  const links = useFetch<RequirementLinks>(`/requirements/${id}/links`);
  const { userName, sprintName } = useLookups();

  if (requirement.loading) return <Loading label="Loading requirement" />;
  if (requirement.error)
    return <ErrorBox message={requirement.error} onRetry={requirement.reload} />;
  if (!requirement.data) return null;

  const row = requirement.data;

  return (
    <div>
      <Link
        to="/requirements"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" />
        All requirements
      </Link>

      <PageHeader
        title={`${row.req_code} - ${row.title}`}
        subtitle={row.description}
        actions={
          <div className="flex items-center gap-2">
            <Badge value={row.priority} />
            <Badge value={row.status} />
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
              v{row.version}
            </span>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Type</dt>
              <dd className="mt-0.5">
                <Badge value={row.type} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Owner</dt>
              <dd className="mt-0.5 text-slate-700">{userName(row.owner_id)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Design reference</dt>
              <dd className="mt-0.5 text-slate-700">
                {row.design_reference ?? (
                  <span className="text-rose-600">No design reference recorded</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Version history"
          className="lg:col-span-2"
          actions={<History className="h-4 w-4 text-slate-300" />}
        >
          {history.loading ? (
            <Loading label="Loading history" />
          ) : history.error ? (
            <ErrorBox message={history.error} onRetry={history.reload} />
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState message="No version entries yet" />
          ) : (
            <ol className="space-y-3">
              {(history.data ?? []).map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-semibold text-indigo-700">
                    v{entry.version}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{entry.summary}</p>
                    <p className="text-xs text-slate-400">
                      {entry.changed_by_name} - {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Linked tasks">
          {links.loading ? (
            <Loading />
          ) : links.error ? (
            <ErrorBox message={links.error} onRetry={links.reload} />
          ) : (links.data?.tasks ?? []).length === 0 ? (
            <EmptyState message="No tasks linked yet" />
          ) : (
            <Table head={["Task", "Type", "Status", "Assignee"]}>
              {(links.data?.tasks ?? []).map((task) => (
                <tr key={task.id}>
                  <td className="px-3 py-2 text-slate-700">{task.title}</td>
                  <td className="px-3 py-2">
                    <Badge value={task.task_type} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={task.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {userName(task.assigned_to)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Test cases">
          {links.loading ? (
            <Loading />
          ) : (links.data?.test_cases ?? []).length === 0 ? (
            <EmptyState
              message="No test cases cover this requirement"
              hint="QA can add one from the Test Cases page."
            />
          ) : (
            <Table head={["Code", "Title", "Status"]}>
              {(links.data?.test_cases ?? []).map((testCase) => (
                <tr key={testCase.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    {testCase.test_code}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{testCase.title}</td>
                  <td className="px-3 py-2">
                    <Badge value={testCase.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Bugs">
          {links.loading ? (
            <Loading />
          ) : (links.data?.bugs ?? []).length === 0 ? (
            <EmptyState message="No bugs reported" />
          ) : (
            <Table head={["Code", "Title", "Severity", "Status"]}>
              {(links.data?.bugs ?? []).map((bug) => (
                <tr key={bug.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    {bug.bug_code}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{bug.title}</td>
                  <td className="px-3 py-2">
                    <Badge value={bug.severity} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={bug.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Deployments">
          {links.loading ? (
            <Loading />
          ) : (links.data?.deployments ?? []).length === 0 ? (
            <EmptyState message="Not part of any release yet" />
          ) : (
            <Table head={["Version", "Environment", "Status", "Sprint"]}>
              {(links.data?.deployments ?? []).map((deployment) => (
                <tr key={deployment.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    {deployment.version}
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={deployment.environment} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={deployment.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {sprintName(deployment.sprint_id)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
