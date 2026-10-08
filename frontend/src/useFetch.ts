import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "./api";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/** GET a list of urls into one state object; reload() refetches them all. */
export function useFetch<T>(url: string, deps: unknown[] = []): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
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

export function useLookups() {
  const users = useFetch<import("./api").User[]>("/users");
  const requirements = useFetch<import("./api").Requirement[]>("/requirements");
  const sprints = useFetch<import("./api").Sprint[]>("/sprints");

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
