import { useEffect, useState } from "react";
import {
  Badge,
  Card,
  Group,
  List,
  Loader,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { usePortfolioHealth, usePortfolios } from "../lib/queries";
import { ProblemAlert } from "../components/ProblemAlert";

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card withBorder padding="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fw={700} size="1.8rem" c={color}>
        {value}
      </Text>
    </Card>
  );
}

const HEALTH_COLOR: Record<string, string> = { OnTrack: "green", AtRisk: "yellow", OffTrack: "red" };

export function PortfolioHealthPage() {
  const portfolios = usePortfolios();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  // Default to the first portfolio once the list loads.
  useEffect(() => {
    if (!portfolioId && portfolios.data && portfolios.data.length > 0) {
      setPortfolioId(portfolios.data[0]!.id);
    }
  }, [portfolios.data, portfolioId]);

  const health = usePortfolioHealth(portfolioId);
  const d = health.data;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Portfolio Health</Title>
        <Select
          label="Portfolio"
          placeholder={portfolios.isLoading ? "Loading…" : "Select a portfolio"}
          data={(portfolios.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          value={portfolioId}
          onChange={setPortfolioId}
          searchable
          w={280}
        />
      </Group>

      {portfolios.isError ? <ProblemAlert error={portfolios.error} title="Couldn't load portfolios" /> : null}
      {health.isError ? <ProblemAlert error={health.error} title="Couldn't load dashboard" /> : null}

      {!portfolioId ? (
        <Text c="dimmed" py="xl" ta="center">
          Select a portfolio to see its health.
        </Text>
      ) : health.isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : d ? (
        <Stack>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Stat label="On Track" value={d.rollup.onTrackCount} color="green" />
            <Stat label="At Risk" value={d.rollup.atRiskCount} color="yellow" />
            <Stat label="Off Track" value={d.rollup.offTrackCount} color="red" />
            <Stat label="Total Projects" value={d.rollup.totalCount} color="indigo" />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Card withBorder padding="lg">
              <Text fw={600} mb="sm">
                Strategic Alignment
              </Text>
              <Group>
                <RingProgress
                  size={110}
                  thickness={12}
                  roundCaps
                  sections={[{ value: d.alignment.coveragePct, color: "indigo" }]}
                  label={
                    <Text ta="center" fw={700}>
                      {Math.round(d.alignment.coveragePct)}%
                    </Text>
                  }
                />
                <div>
                  <Text size="sm">{d.alignment.alignedCount} aligned</Text>
                  <Text size="sm" c="dimmed">
                    of {d.alignment.activeCount} active
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder padding="lg">
              <Text fw={600} mb="sm">
                Top Escalated Risks
              </Text>
              {d.topEscalatedRisks.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No escalated risks 🎉
                </Text>
              ) : (
                <List spacing="xs" size="sm">
                  {d.topEscalatedRisks.map((r) => (
                    <List.Item key={r.id}>
                      <Group gap="xs" wrap="nowrap">
                        <Badge color="red" variant="light">
                          {r.riskScore ?? "—"}
                        </Badge>
                        <Text size="sm" lineClamp={1}>
                          {r.title}
                        </Text>
                      </Group>
                    </List.Item>
                  ))}
                </List>
              )}
            </Card>

            <Card withBorder padding="lg">
              <Text fw={600} mb="sm">
                At-Risk Projects
              </Text>
              {d.atRiskProjects.length === 0 ? (
                <Text size="sm" c="dimmed">
                  None
                </Text>
              ) : (
                <List spacing="xs" size="sm">
                  {d.atRiskProjects.map((p) => (
                    <List.Item key={p.id}>
                      <Group gap="xs" wrap="nowrap">
                        <Badge color={HEALTH_COLOR[p.health] ?? "gray"} variant="light">
                          {p.health}
                        </Badge>
                        <Text size="sm" lineClamp={1}>
                          {p.name}
                        </Text>
                      </Group>
                    </List.Item>
                  ))}
                </List>
              )}
            </Card>
          </SimpleGrid>

          <Text size="xs" c="dimmed">
            Rolled up {d.rollup.computedAt ? new Date(d.rollup.computedAt).toLocaleString() : "—"}
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
