import { Alert, Code, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { ApiError } from "../lib/api-client";

/** Renders an RFC 7807 problem (or any error) as a Mantine alert. Surfaces the backend
 *  `code` and `requestId` so failures are traceable against the API logs. */
export function ProblemAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    const p = error.problem;
    return (
      <Alert color="red" icon={<IconAlertTriangle size={18} />} title={title ?? p.title}>
        <Text size="sm">{p.detail ?? p.title}</Text>
        <Text size="xs" c="dimmed" mt={4}>
          {p.code ? <Code>{p.code}</Code> : null} status {p.status}
          {p.requestId ? ` · request ${p.requestId}` : ""}
        </Text>
      </Alert>
    );
  }
  return (
    <Alert color="red" icon={<IconAlertTriangle size={18} />} title={title ?? "Something went wrong"}>
      <Text size="sm">{error instanceof Error ? error.message : String(error)}</Text>
    </Alert>
  );
}
