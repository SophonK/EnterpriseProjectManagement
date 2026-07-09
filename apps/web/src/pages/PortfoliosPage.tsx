import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useCreatePortfolio, usePortfolios } from "../lib/queries";
import { ApiError } from "../lib/api-client";
import { ProblemAlert } from "../components/ProblemAlert";

export function PortfoliosPage() {
  const portfolios = usePortfolios();
  const create = useCreatePortfolio();
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      notifications.show({ color: "green", message: `Portfolio "${name.trim()}" created` });
      setOpened(false);
      setName("");
      setDescription("");
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof ApiError ? err.problem.detail ?? err.problem.title : "Create failed",
      });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Portfolios</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setOpened(true)}>
          New portfolio
        </Button>
      </Group>

      {portfolios.isError ? <ProblemAlert error={portfolios.error} title="Couldn't load portfolios" /> : null}

      {portfolios.isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : portfolios.data && portfolios.data.length > 0 ? (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Goals</Table.Th>
              <Table.Th>Owner</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {portfolios.data.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text fw={500}>{p.name}</Text>
                  {p.description ? (
                    <Text size="xs" c="dimmed">
                      {p.description}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={p.status === "Active" ? "green" : "gray"}>
                    {p.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{p.goalIds.length}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.ownerId.slice(0, 8)}…
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" py="xl" ta="center">
          No portfolios yet. Create the first one.
        </Text>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title="New portfolio" centered>
        <Stack>
          <TextInput
            label="Name"
            placeholder="e.g. Digital Transformation"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            data-autofocus
          />
          <Textarea
            label="Description"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={create.isPending} disabled={!name.trim()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
