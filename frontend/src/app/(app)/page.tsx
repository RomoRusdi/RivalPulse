import { AgentWorkspace } from "@/components/agent/AgentWorkspace";

export default async function AgentPage({ searchParams }: PageProps<"/">) {
  const { prompt } = await searchParams;
  return <AgentWorkspace initialPrompt={typeof prompt === "string" ? prompt.slice(0, 2000) : ""} />;
}
