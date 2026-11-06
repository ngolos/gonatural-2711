import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

// Polls only while a background run is in progress, then stops.
const POLL = 4000;
const busy = (s?: string | null) => !!s && !["complete", "failed", "interrupted"].includes(s);

export function useFragranceProfile(productId: string) {
  return useQuery(
    orpc.intelligence.profile.queryOptions({
      input: { productId },
      enabled: !!productId,
      retry: false,
      refetchInterval: (q) => (q.state.data?.territoryRun && !q.state.data.territoryRun.error ? POLL : false),
    }),
  );
}
export function useAuditReports(productId: string, enabled = true) {
  return useQuery(
    orpc.intelligence.reports.queryOptions({
      input: { productId },
      enabled: !!productId && enabled,
      retry: false,
      refetchInterval: (q) => (q.state.data?.some((r) => busy(r.status)) ? POLL : false),
    }),
  );
}
export function useAuditReport(id: string | null) {
  return useQuery(
    orpc.intelligence.report.queryOptions({
      input: { id: id ?? "" },
      enabled: !!id,
      retry: false,
      refetchInterval: (q) => (busy(q.state.data?.status) ? POLL : false),
    }),
  );
}
export function useFlags(enabled = true) {
  return useQuery(
    orpc.intelligence.flags.queryOptions({
      enabled,
      retry: false,
      refetchInterval: (q) => (q.state.data?.run.running ? POLL : false),
    }),
  );
}
export function useGeneratedTerritories(productId: string, enabled = true) {
  return useQuery(
    orpc.intelligence.territories.queryOptions({
      input: { productId },
      enabled: !!productId && enabled,
      retry: false,
      refetchInterval: (q) =>
        (q.state.data?.run && !q.state.data.run.error) ||
        q.state.data?.items.some((d) => ["generating", "storing"].includes(d.board.status)) ||
        q.state.data?.shortlists.some((x) => (x.run && !x.run.error) || x.current?.boardRunning || busy(x.board?.status))
          ? POLL
          : false,
    }),
  );
}
export function useTerritoryStatuses(enabled = true) {
  return useQuery(orpc.intelligence.statuses.queryOptions({ enabled, retry: false }));
}
export function useGenerationJobs(productId: string, enabled = true) {
  return useQuery(
    orpc.intelligence.jobs.queryOptions({
      input: { productId },
      enabled: !!productId && enabled,
      retry: false,
      refetchInterval: (q) => (q.state.data?.some((j) => busy(j.status)) ? POLL : false),
    }),
  );
}
