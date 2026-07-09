import { Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import { IconLogin } from "@tabler/icons-react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  return (
    <Center h="100vh">
      <Card withBorder shadow="sm" padding="xl" radius="md" w={420}>
        <Stack gap="md">
          <div>
            <Title order={2}>EPM Platform</Title>
            <Text c="dimmed" size="sm">
              Enterprise Project &amp; Portfolio Management
            </Text>
          </div>
          <Text size="sm">
            Sign in with your organization account. You'll be redirected to the identity
            provider and back.
          </Text>
          <Button leftSection={<IconLogin size={18} />} onClick={login} fullWidth>
            Sign in with SSO
          </Button>
          <Text size="xs" c="dimmed">
            The session is a secure httpOnly cookie set by the API after the OIDC callback.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
