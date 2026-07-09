import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PortfolioDTO, PortfolioHealthDashboardDTO } from "@epm/shared";
import { api } from "./api-client";

// The strategy list endpoint may return a bare array or a { data, total } envelope depending
// on the handler — normalize both so the UI doesn't care.
type Listish<T> = T[] | { data: T[]; total?: number };
function toArray<T>(v: Listish<T>): T[] {
  return Array.isArray(v) ? v : (v?.data ?? []);
}

const keys = {
  portfolios: ["portfolios"] as const,
  portfolioHealth: (id: string) => ["portfolio-health", id] as const,
};

export function usePortfolios() {
  return useQuery({
    queryKey: keys.portfolios,
    queryFn: async () => toArray(await api.get<Listish<PortfolioDTO>>("/api/v1/strategy/portfolios")),
  });
}

export interface CreatePortfolioInput {
  name: string;
  description?: string;
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePortfolioInput) =>
      api.post<PortfolioDTO>("/api/v1/strategy/portfolios", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.portfolios }),
  });
}

export function usePortfolioHealth(portfolioId: string | null) {
  return useQuery({
    queryKey: keys.portfolioHealth(portfolioId ?? ""),
    enabled: Boolean(portfolioId),
    queryFn: () =>
      api.get<PortfolioHealthDashboardDTO>(
        `/api/v1/dashboards/portfolio-health?portfolioId=${encodeURIComponent(portfolioId!)}`,
      ),
  });
}

/** Public health probe — no auth. Used on the shell to show backend connectivity. */
export function useApiHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ status: string; db: string; version: string }>("/health"),
    refetchInterval: 30_000,
  });
}
