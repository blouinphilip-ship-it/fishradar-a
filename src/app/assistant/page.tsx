import type { Metadata } from "next";
import { Chat } from "@/components/assistant/chat";
import { aiEnabled } from "@/lib/ai/claude";

export const metadata: Metadata = { title: "AI Fishing Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="mx-auto flex h-[calc(100dvh-60px)] w-full max-w-3xl flex-col px-4 py-4">
      <h1 className="text-2xl font-bold">AI Fishing Assistant</h1>
      {!aiEnabled() && <p className="mt-1 rounded-md border border-border bg-muted p-2 text-xs">Running in <b>offline mode</b>: answers are assembled from FishRadar&apos;s live data and reports without the language model. Add <code>ANTHROPIC_API_KEY</code> to enable full conversational answers with Claude.</p>}
      <Chat key={q ?? "chat"} initial={q} />
    </div>
  );
}
