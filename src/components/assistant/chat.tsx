"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; citations?: Citation[]; mode?: string };
type Citation = { id: number; title: string | null; spotName: string | null; publishedAt: string; isDemo: boolean; url: string | null; sourceName: string };

const EXAMPLES = [
  "I'm in Rye, NH with a kayak Saturday morning. What should I target and with what?",
  "Are the albies still at Montauk?",
  "Best tide and lure for bull reds in Mosquito Lagoon this week?",
  "Where's the striper run right now and where will it be in 10 days?",
  "Smallmouth on Winnipesaukee — what's working?",
];

/** Tiny, safe markdown: **bold**, _italic_, ### headings, bullet lists, [R123] citations. */
function render(md: string, cites: Citation[] | undefined) {
  return md.split("\n").map((line, i) => {
    const html = line
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, "$1<em>$2</em>")
      .replace(/\[R(\d+)\]/g, (_m, id) => { const n = (cites ?? []).findIndex((c) => c.id === Number(id)); return `<a href="#cite-${id}" class="text-primary">[${n >= 0 ? n + 1 : "R" + id}]</a>`; });
    if (line.startsWith("### ")) return <h3 key={i} className="mt-2 font-semibold" dangerouslySetInnerHTML={{ __html: html.slice(4) }} />;
    if (/^\s*[-*] /.test(line)) return <li key={i} className="ml-5 list-disc" dangerouslySetInnerHTML={{ __html: html.replace(/^\s*[-*] /, "") }} />;
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export function Chat({ initial }: { initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    try { const h = localStorage.getItem("fr-chat"); if (h) setMsgs(JSON.parse(h)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("fr-chat", JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);
  useEffect(() => {
    if (initial && !sentInitial.current) { sentInitial.current = true; void send(initial); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null);
    setInput("");
    const history = [...msgs, { role: "user" as const, content: q }];
    setMsgs([...history, { role: "assistant", content: "", tools: [] }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `Request failed (${res.status})`); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l);
          setMsgs((m) => {
            const copy = [...m];
            const last = { ...copy[copy.length - 1] };
            if (ev.type === "text") last.content += ev.delta;
            if (ev.type === "tool") last.tools = [...(last.tools ?? []), ev.name];
            if (ev.type === "citations") last.citations = ev.reports;
            if (ev.type === "mode") last.mode = ev.mode;
            if (ev.type === "error") last.content += `\n\n_${ev.message}_`;
            copy[copy.length - 1] = last;
            return copy;
          });
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {msgs.length === 0 && (
          <div className="py-6">
            <p className="text-sm text-muted-foreground">Ask about any spot, species or run. Answers cite FishRadar&apos;s reports and live conditions.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-lg border border-border p-3 text-left text-sm hover:bg-muted">{e}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("rounded-xl p-3 text-sm", m.role === "user" ? "ml-auto max-w-[85%] bg-primary text-primary-foreground" : "border border-border bg-surface")}>
            {m.role === "assistant" && (m.tools?.length || m.mode) ? (
              <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {m.mode === "offline" ? <Badge variant="outline">Offline mode</Badge> : m.mode === "claude" ? <Badge variant="prediction"><Sparkles className="size-3" /> Claude</Badge> : null}
                {m.tools?.map((t, j) => <span key={j} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><Wrench className="size-3" />{t.replace(/_/g, " ")}</span>)}
              </p>
            ) : null}
            {m.role === "assistant" ? <div className="space-y-1 leading-relaxed">{render(m.content, m.citations)}{busy && i === msgs.length - 1 && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />}</div> : m.content}
            {m.citations && m.citations.length > 0 && (
              <ol className="mt-3 space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
                {m.citations.map((c, j) => <li key={c.id} id={`cite-${c.id}`}>[{j + 1}] {c.sourceName}{c.spotName ? ` · ${c.spotName}` : ""} · {new Date(c.publishedAt).toLocaleDateString()}{c.isDemo ? " · demo data" : ""}{c.url && <> · <a href={c.url} className="text-primary" target="_blank" rel="noreferrer">source</a></>}</li>)}
              </ol>
            )}
          </div>
        ))}
        {err && <p className="text-sm text-danger">{err}</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-0 flex gap-2 border-t border-border bg-background pt-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a spot, species or run…" aria-label="Your question" className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm" maxLength={4000} />
        <Button type="submit" disabled={busy || !input.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Ask</Button>
        {msgs.length > 0 && <Button type="button" variant="ghost" size="icon" aria-label="Clear conversation" onClick={() => { setMsgs([]); try { localStorage.removeItem("fr-chat"); } catch { /* */ } }}><Trash2 /></Button>}
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">AI answers can be wrong. Predictions are not guarantees — always check conditions and <Link href="/saltwater" className="underline">official regulations</Link>.</p>
    </div>
  );
}
