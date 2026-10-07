import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-agent-inter", display: "swap" });

export default async function AgentPage({ searchParams }: PageProps<"/">) {
  const { prompt, chat } = await searchParams;
  return <div className={`${inter.variable} h-full`}><AgentWorkspace initialAction={chat === "new" || chat === "history" ? chat : undefined} initialPrompt={typeof prompt === "string" ? prompt.slice(0, 2000) : ""} /></div>;
}
