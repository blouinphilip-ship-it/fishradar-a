import { z } from "zod";
import { auth } from "@/auth";
import { runAssistant } from "@/lib/ai/assistant";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

/** Streams newline-delimited JSON events from the assistant. */
export async function POST(req: Request) {
  const session = await auth();
  const key = session?.user?.id ?? req.headers.get("x-forwarded-for") ?? "anon";
  const rl = rateLimit(`assistant:${key}`, session?.user ? 30 : 10, 60 * 60_000);
  if (!rl.ok) return Response.json({ error: `Rate limit reached. Try again in ${Math.ceil(rl.retryAfterS / 60)} min.` }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return Response.json({ error: "invalid request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAssistant(parsed.data.messages)) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      } catch {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: "Assistant failed" }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
