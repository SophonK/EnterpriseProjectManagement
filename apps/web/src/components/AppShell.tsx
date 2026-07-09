import { AppShell, Badge, Burger, Group, NavLink, ScrollArea, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChartBar,
  IconFolders,
  IconLayoutDashboard,
  IconLogout,
  IconTargetArrow,
} from "@tabler/icons-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useApiHealth } from "../lib/queries";

const NAV = [
  { to: "/portfolios", label: "Portfolios", icon: IconFolders },
  { to: "/dashboard", label: "Portfolio Health", icon: IconLayoutDashboard },
  { to: "/goals", label: "Strategic Goals", icon: IconTargetArrow, disabled: true },
  { to: "/reports", label: "Reports", icon: IconChartBar, disabled: true },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  const { logout } = useAuth();
  const health = useApiHealth();

  const dbUp = health.data?.db === "up";

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg">
              EPM Platform
            </Text>
          </Group>
          <Group gap="sm">
            <Tooltip label={health.isError ? "API unreachable" : `API v${health.data?.version ?? "?"}`}>
              <Badge color={health.isError ? "red" : dbUp ? "green" : "yellow"} variant="light">
                {health.isError ? "API down" : dbUp ? "API · db up" : "API · connecting"}
              </Badge>
            </Tooltip>
            <UnstyledButton onClick={() => void logout()}>
              <Group gap={6}>
                <IconLogout size={18} />
                <Text size="sm">Sign out</Text>
              </Group>
            </UnstyledButton>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {NAV.map((item) => {
            const common = {
              label: item.label,
              leftSection: <item.icon size={18} />,
              rightSection: item.disabled ? (
                <Badge size="xs" variant="light" color="gray">
                  soon
                </Badge>
              ) : null,
            };
            return item.disabled ? (
              <NavLink key={item.to} {...common} disabled />
            ) : (
              <NavLink
                key={item.to}
                {...common}
                component={RouterNavLink}
                to={item.to}
                active={location.pathname.startsWith(item.to)}
              />
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
