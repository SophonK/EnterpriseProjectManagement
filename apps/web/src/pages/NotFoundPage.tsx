import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Center h="60vh">
      <Stack align="center" gap="xs">
        <Title order={1}>404</Title>
        <Text c="dimmed">This page doesn't exist.</Text>
        <Button variant="light" onClick={() => navigate("/portfolios")}>
          Back to portfolios
        </Button>
      </Stack>
    </Center>
  );
}
