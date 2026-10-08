import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, type Project } from "./api";
import { useAuth } from "./auth";

const PROJECT_KEY = "intellisdlc_project";

interface ProjectState {
  projects: Project[];
  /** null while projects are loading, or when the account has none yet. */
  projectId: number | null;
  project: Project | null;
  setProjectId: (id: number) => void;
  reloadProjects: () => void;
  loading: boolean;
  /** False until the first fetch settles. Callers must not treat an empty
   *  projects list as "this account has none" before this flips true. */
  ready: boolean;
}

const ProjectContext = createContext<ProjectState | null>(null);

function readStoredId(): number | null {
  const raw = localStorage.getItem(PROJECT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setStoredProjectId] = useState<number | null>(readStoredId);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  const reloadProjects = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setReady(false);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get<Project[]>("/projects")
      .then((response) => {
        if (!active) return;
        setProjects(response.data);
        // Keep the stored choice when it still exists, otherwise fall back to
        // the first project so the app always has something to show.
        setStoredProjectId((current) => {
          if (current && response.data.some((project) => project.id === current)) {
            return current;
          }
          return response.data[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (active) setProjects([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [user, tick]);

  const setProjectId = useCallback((id: number) => {
    localStorage.setItem(PROJECT_KEY, String(id));
    setStoredProjectId(id);
  }, []);

  const value = useMemo<ProjectState>(
    () => ({
      projects,
      projectId,
      project: projects.find((project) => project.id === projectId) ?? null,
      setProjectId,
      reloadProjects,
      loading,
      ready,
    }),
    [projects, projectId, setProjectId, reloadProjects, loading, ready],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectState {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used inside ProjectProvider");
  }
  return context;
}

/**
 * Build a querystring carrying the selected project, or null when no project is
 * selected yet. Pages pass the result straight to useFetch, which skips a null url.
 */
export function projectUrl(
  path: string,
  projectId: number | null,
  extra: Record<string, string | number | undefined> = {},
): string | null {
  if (!projectId) return null;
  const params = new URLSearchParams({ project_id: String(projectId) });
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `${path}?${params.toString()}`;
}
