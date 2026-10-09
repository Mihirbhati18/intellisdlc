import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { useAuth } from "./auth";
import { useProject } from "./project";
import { Bugs } from "./pages/Bugs";
import { Chat } from "./pages/Chat";
import { Code } from "./pages/Code";
import { Dashboard } from "./pages/Dashboard";
import { Deployments } from "./pages/Deployments";
import { Login } from "./pages/Login";
import { Projects } from "./pages/Projects";
import { RequirementDetail } from "./pages/RequirementDetail";
import { Requirements } from "./pages/Requirements";
import { Risk } from "./pages/Risk";
import { SprintBoard } from "./pages/SprintBoard";
import { Sprints } from "./pages/Sprints";
import { TestCases } from "./pages/TestCases";
import { Traceability } from "./pages/Traceability";

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { projects, ready } = useProject();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  // Wait for the first projects fetch before deciding anything: an empty list
  // means "still loading" until `ready` flips, and redirecting on it would
  // bounce every sign-in to the Projects page.
  if (!ready) {
    return (
      <Layout>
        <Loading label="Loading your projects" />
      </Layout>
    );
  }
  // With no projects at all the other pages have nothing to show, so send
  // people to Projects where they can create the first one.
  if (projects.length === 0 && location.pathname !== "/projects") {
    return <Navigate to="/projects" replace />;
  }
  return <Layout>{children}</Layout>;
}

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/projects"
        element={
          <Protected>
            <Projects />
          </Protected>
        }
      />
      <Route
        path="/requirements"
        element={
          <Protected>
            <Requirements />
          </Protected>
        }
      />
      <Route
        path="/requirements/:id"
        element={
          <Protected>
            <RequirementDetail />
          </Protected>
        }
      />
      <Route
        path="/sprints"
        element={
          <Protected>
            <Sprints />
          </Protected>
        }
      />
      <Route
        path="/sprints/:id"
        element={
          <Protected>
            <SprintBoard />
          </Protected>
        }
      />
      <Route
        path="/bugs"
        element={
          <Protected>
            <Bugs />
          </Protected>
        }
      />
      <Route
        path="/test-cases"
        element={
          <Protected>
            <TestCases />
          </Protected>
        }
      />
      <Route
        path="/code"
        element={
          <Protected>
            <Code />
          </Protected>
        }
      />
      <Route
        path="/deployments"
        element={
          <Protected>
            <Deployments />
          </Protected>
        }
      />
      <Route
        path="/traceability"
        element={
          <Protected>
            <Traceability />
          </Protected>
        }
      />
      <Route
        path="/risk"
        element={
          <Protected>
            <ManagerOnly>
              <Risk />
            </ManagerOnly>
          </Protected>
        }
      />
      <Route
        path="/chat"
        element={
          <Protected>
            <Chat />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
