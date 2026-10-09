import axios from "axios";

export const TOKEN_KEY = "intellisdlc_token";
export const USER_KEY = "intellisdlc_user";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const onLogin = window.location.pathname === "/login";
    if (status === 401 && !onLogin) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.replace("/login");
    }
    return Promise.reject(error);
  },
);

const UNREACHABLE =
  "Cannot reach the IntelliSDLC API. Check that the backend is running on port 8000.";

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;

    // No response at all, or the dev proxy answering for a backend that is not
    // listening: "Request failed with status code 500" tells the user nothing.
    if (!error.response || error.code === "ERR_NETWORK") return UNREACHABLE;

    const status = error.response.status;
    if (status >= 500) return UNREACHABLE;
    if (status === 403) return "You do not have permission to do that.";
    if (status === 404) return "That record no longer exists.";
    return error.message;
  }
  return "Something went wrong.";
}

// ----------------------------------------------------------------- types
export type Role = "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" | "QA_ENGINEER";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  skills: string;
  capacity_hours: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
}

export interface Requirement {
  id: number;
  req_code: string;
  project_id: number;
  title: string;
  description: string;
  type: "FUNCTIONAL" | "NON_FUNCTIONAL";
  priority: Priority;
  status: RequirementStatus;
  owner_id: number | null;
  version: number;
  design_reference: string | null;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RequirementStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "IN_DEVELOPMENT"
  | "TESTED"
  | "DEPLOYED"
  | "REJECTED";

export interface RequirementVersionRow {
  id: number;
  version: number;
  summary: string;
  changed_by: number | null;
  changed_by_name: string;
  created_at: string;
}

export interface Sprint {
  id: number;
  project_id: number;
  sprint_number: number;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED";

export interface Task {
  id: number;
  sprint_id: number | null;
  requirement_id: number | null;
  title: string;
  task_type: "DESIGN" | "DEVELOPMENT" | "TESTING";
  estimate_hours: number;
  status: TaskStatus;
  assigned_to: number | null;
  completed_at: string | null;
}

export type BugStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "RETEST"
  | "CLOSED"
  | "REOPENED";

export interface Bug {
  id: number;
  bug_code: string;
  project_id: number;
  requirement_id: number | null;
  sprint_id: number | null;
  title: string;
  severity: Priority;
  status: BugStatus;
  assignee_id: number | null;
}

export interface TestCase {
  id: number;
  test_code: string;
  requirement_id: number;
  title: string;
  expected_result: string;
  status: "NOT_RUN" | "PASSED" | "FAILED";
}

export interface Deployment {
  id: number;
  project_id: number;
  sprint_id: number | null;
  version: string;
  environment: "DEV" | "STAGING" | "PRODUCTION";
  status: "SUCCESS" | "FAILED" | "PENDING";
  created_at: string;
  requirement_ids: number[];
}

export interface ChartPoint {
  name: string;
  value: number;
}

export interface DashboardData {
  project_id: number;
  counts: {
    requirements: number;
    sprints: number;
    tasks: number;
    tasks_done: number;
    open_bugs: number;
    critical_bugs: number;
    test_cases: number;
    tests_passed: number;
    tests_failed: number;
    deployments: number;
    completion_pct: number;
  };
  tasks_by_status: ChartPoint[];
  bugs_by_severity: ChartPoint[];
  requirements_by_status: ChartPoint[];
  active_sprint: Sprint | null;
}

export interface TraceabilityRow {
  requirement_id: number;
  req_code: string;
  title: string;
  priority: Priority;
  status: RequirementStatus;
  version: number;
  designed: "DONE" | "MISSING";
  implemented: "NOT_STARTED" | "PARTIAL" | "DONE";
  implemented_detail: string;
  commits: number;
  tested: "NO_TESTS" | "FAILED" | "PASSED" | "PENDING";
  tested_detail: string;
  test_count: number;
  open_bugs: number;
  critical_open_bugs: number;
  deployed: "DEV" | "STAGING" | "PRODUCTION" | "NOT_DEPLOYED";
  overall: "COMPLETE" | "AT_RISK" | "INCOMPLETE";
  coverage_pct: number;
}

export interface TraceabilityMatrix {
  project_id: number;
  rows: TraceabilityRow[];
  summary: {
    total: number;
    complete: number;
    at_risk: number;
    incomplete: number;
    without_tests: number;
    with_commits: number;
    avg_coverage_pct: number;
  };
}

export interface RiskDriver {
  feature: string;
  label: string;
  value: number;
  contribution: number;
  text: string;
  action: string;
}

export interface RiskResult {
  prediction_id: number;
  sprint_id: number;
  sprint_name: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  features: Record<string, number>;
  drivers: RiskDriver[];
  actions: string[];
  created_at: string;
}

export interface ModelMetrics {
  model: string;
  rows: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  at_risk_share: number;
  confusion_matrix: number[][];
  features: string[];
  coefficients: Record<string, number>;
}

export interface AgentReply {
  answer: string;
  mode: "gemini" | "offline";
  category: string;
  sources: string[];
}


export interface Repository {
  id: number;
  project_id: number;
  name: string;
  path: string;
  branch: string;
  last_synced_at: string | null;
  commit_count: number;
  auto_update_status: boolean;
}

export interface Commit {
  id: number;
  repository_id: number;
  project_id: number;
  sha: string;
  short_sha: string;
  author_name: string;
  author_email: string;
  committed_at: string;
  subject: string;
  body: string;
  requirement_codes: string[];
}

export interface SyncResult {
  repository_id: number;
  branch: string;
  commits_read: number;
  commits_added: number;
  commits_total: number;
  links_written: number;
  unmatched_codes: string[];
  last_synced_at: string;
  auto_update_status: boolean;
  status_updates: StatusUpdate[];
}

export interface StatusUpdate {
  requirement_id: number;
  req_code: string;
  from_status: string;
  to_status: string;
  commit: string;
  commit_subject: string;
}

export interface EvidenceRow {
  requirement_id: number;
  req_code: string;
  title: string;
  status: string;
  commits: number;
  primary_commits: number;
  issue: "STATUS_BEHIND" | "NO_EVIDENCE" | null;
  detail: string;
  suggested_status: string | null;
}

export interface EvidenceReport {
  project_id: number;
  rows: EvidenceRow[];
  summary: {
    total: number;
    status_behind: number;
    no_evidence: number;
    agreeing: number;
  };
}

export interface RequirementLinks {
  tasks: Task[];
  test_cases: TestCase[];
  bugs: Bug[];
  deployments: Deployment[];
}
