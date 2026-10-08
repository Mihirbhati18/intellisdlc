import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { TraceabilityMatrix } from "../api";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  ProgressBar,
  Select,
} from "../components/ui";
import { useProject } from "../project";
import { useFetch } from "../useFetch";

const OVERALL_FILTERS = [
  { value: "", label: "All requirements" },
  { value: "COMPLETE", label: "Complete only" },
  { value: "AT_RISK", label: "At risk only" },
  { value: "INCOMPLETE", label: "Incomplete only" },
];

export function Traceability() {
  const { projectId } = useProject();
  const { data, loading, error, reload } = useFetch<TraceabilityMatrix>(
    projectId ? `/traceability?project_id=${projectId}` : null,
  );
  const [overall, setOverall] = useState("");

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return all.filter((row) => !overall || row.overall === overall);
  }, [data, overall]);

  if (loading) return <Loading label="Building the matrix" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary } = data;

  return (
    <div>
      <PageHeader
        title="Traceability Matrix"
        subtitle="Each requirement traced through design, build, test, defects and release"
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Average coverage
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {summary.avg_coverage_pct}%
          </p>
          <div className="mt-2">
            <ProgressBar value={summary.avg_coverage_pct} />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Complete
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">
            {summary.complete}
          </p>
          <p className="mt-0.5 text-xs text-emerald-600">
            of {summary.total} requirements
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600">
            At risk
          </p>
          <p className="mt-2 text-2xl font-semibold text-rose-700">
            {summary.at_risk}
          </p>
          <p className="mt-0.5 text-xs text-rose-600">
            failing tests or critical bugs
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
            Without tests
          </p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">
            {summary.without_tests}
          </p>
          <p className="mt-0.5 text-xs text-amber-600">
            no test case written yet
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={overall}
            onChange={setOverall}
            className="sm:max-w-[14rem]"
            options={OVERALL_FILTERS}
          />
          <p className="text-xs text-slate-400">
            Showing {rows.length} of {summary.total}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState message="No requirements in this category" />
        ) : (
          // Not the shared <Table>: this one is wide enough to scroll sideways, and
          // Overall is the column a reader actually came for, so it is pinned to the
          // right edge instead of being the first thing to disappear.
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  {[
                    "Code",
                    "Requirement",
                    "Designed",
                    "Implemented",
                    "Tested",
                    "Bugs",
                    "Deployed",
                    "Coverage",
                  ].map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-2 py-2 font-medium"
                    >
                      {column}
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 whitespace-nowrap border-l border-slate-200 bg-white px-2 py-2 font-medium">
                    Overall
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.requirement_id}
                    className="group hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-2 py-2.5 font-medium">
                      <Link
                        to={`/requirements/${row.requirement_id}`}
                        className="text-slate-900 hover:text-indigo-600"
                      >
                        {row.req_code}
                      </Link>
                    </td>
                    <td
                      className="max-w-[11rem] truncate px-2 py-2.5 text-slate-700"
                      title={row.title}
                    >
                      {row.title}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge value={row.designed} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <Badge value={row.implemented} />
                      <span className="ml-1.5 text-xs text-slate-400">
                        {row.implemented_detail}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <Badge value={row.tested} />
                      {row.test_count > 0 && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {row.tested_detail}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {row.open_bugs === 0 ? (
                        <span className="text-xs text-slate-400">none</span>
                      ) : (
                        <span
                          className={
                            row.critical_open_bugs > 0
                              ? "text-sm font-medium text-rose-600"
                              : "text-sm text-amber-600"
                          }
                        >
                          {row.open_bugs} open
                          {row.critical_open_bugs > 0 &&
                            ` (${row.critical_open_bugs} critical)`}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge value={row.deployed} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex w-20 items-center gap-1.5">
                        <ProgressBar
                          value={row.coverage_pct}
                          tone={
                            row.coverage_pct === 100
                              ? "emerald"
                              : row.coverage_pct >= 60
                                ? "indigo"
                                : "amber"
                          }
                        />
                        <span className="w-8 shrink-0 text-xs text-slate-500">
                          {row.coverage_pct}%
                        </span>
                      </div>
                    </td>
                    <td className="sticky right-0 z-10 border-l border-slate-200 bg-white px-2 py-2.5 group-hover:bg-slate-50">
                      <Badge value={row.overall} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
