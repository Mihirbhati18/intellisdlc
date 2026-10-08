import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, errorMessage, type TestCase } from "../api";
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

const STATUSES = ["NOT_RUN", "PASSED", "FAILED"];

export function TestCases() {
  const { user, isManager } = useAuth();
  const canEdit = isManager || user?.role === "QA_ENGINEER";
  const { data, loading, error, reload } = useFetch<TestCase[]>("/test-cases");
  const { requirements, reqCode } = useLookups();

  const [statusFilter, setStatusFilter] = useState("");
  const [rowError, setRowError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    title: "",
    expected_result: "",
    requirement_id: "",
    status: "NOT_RUN",
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return all.filter((testCase) => !statusFilter || testCase.status === statusFilter);
  }, [data, statusFilter]);

  async function setStatus(testCase: TestCase, status: string) {
    setBusy(testCase.id);
    setRowError("");
    try {
      await api.patch(`/test-cases/${testCase.id}`, { status });
      reload();
    } catch (caught) {
      setRowError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/test-cases", {
        title: form.title,
        expected_result: form.expected_result,
        requirement_id: Number(form.requirement_id),
        status: form.status,
      });
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
        title="Test Cases"
        subtitle="Mark a case passed or failed and the traceability matrix updates with it"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setForm({
                  title: "",
                  expected_result: "",
                  requirement_id: requirements[0] ? String(requirements[0].id) : "",
                  status: "NOT_RUN",
                });
                setSaveError("");
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New test case
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="sm:max-w-[12rem]"
            options={[
              { value: "", label: "All statuses" },
              ...STATUSES.map((status) => ({
                value: status,
                label: status.replaceAll("_", " "),
              })),
            ]}
          />
        </div>

        {rowError && (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {rowError}
          </p>
        )}

        {loading ? (
          <Loading label="Loading test cases" />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState message="No test cases match this filter" />
        ) : (
          <Table head={["Code", "Requirement", "Title", "Expected result", "Status", ""]}>
            {rows.map((testCase) => (
              <tr key={testCase.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                  {testCase.test_code}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Link
                    to={`/requirements/${testCase.requirement_id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    {reqCode(testCase.requirement_id)}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{testCase.title}</td>
                <td className="px-3 py-2.5 text-slate-500">{testCase.expected_result}</td>
                <td className="px-3 py-2.5">
                  <Badge value={testCase.status} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canEdit && (
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => void setStatus(testCase, "PASSED")}
                        disabled={busy === testCase.id}
                        title="Mark passed"
                        className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void setStatus(testCase, "FAILED")}
                        disabled={busy === testCase.id}
                        title="Mark failed"
                        className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {creating && (
        <Modal
          title="New test case"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={saving || !form.title.trim() || !form.requirement_id}
              >
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          }
        >
          <Field label="Requirement">
            <Select
              value={form.requirement_id}
              onChange={(value) => setForm({ ...form, requirement_id: value })}
              options={requirements.map((requirement) => ({
                value: String(requirement.id),
                label: `${requirement.req_code} - ${requirement.title}`,
              }))}
            />
          </Field>
          <Field label="Title">
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Expected result">
            <textarea
              value={form.expected_result}
              onChange={(event) => setForm({ ...form, expected_result: event.target.value })}
              rows={2}
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
