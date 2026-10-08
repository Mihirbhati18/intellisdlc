import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "./api";
import { useProject } from "./project";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * GET a url into state. Passing null skips the request entirely, which is how
 * pages wait for a project to be selected without firing an unscoped query.
 */
export function useFetch<T>(url: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    api
      .get<T>(url)
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);

  return { data, loading, error, reload };
}

/** Users are global; requirements and sprints are scoped to the open project. */
export function useLookups() {
  const { projectId } = useProject();
  const scoped = (path: string) => (projectId ? `${path}?project_id=${projectId}` : null);

  const users = useFetch<import("./api").User[]>("/users");
  const requirements = useFetch<import("./api").Requirement[]>(scoped("/requirements"));
  const sprints = useFetch<import("./api").Sprint[]>(scoped("/sprints"));

  const userName = (id: number | null | undefined) =>
    users.data?.find((user) => user.id === id)?.full_name ?? "Unassigned";
  const reqCode = (id: number | null | undefined) =>
    requirements.data?.find((requirement) => requirement.id === id)?.req_code ?? "-";
  const sprintName = (id: number | null | undefined) =>
    sprints.data?.find((sprint) => sprint.id === id)?.name ?? "-";

  return {
    users: users.data ?? [],
    requirements: requirements.data ?? [],
    sprints: sprints.data ?? [],
    loading: users.loading || requirements.loading || sprints.loading,
    userName,
    reqCode,
    sprintName,
  };
}
