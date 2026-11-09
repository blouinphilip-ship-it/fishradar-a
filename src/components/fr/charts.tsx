"use client";

import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { scoreColor } from "./score";

const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
const hour = (t: string) => new Date(t).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: tz });

export function TideChart({ curve, events }: { curve: { time: string; ft: number }[]; events: { time: string; ft: number; type: "H" | "L" }[] }) {
  const now = Date.now();
  const data = curve.filter((p) => new Date(p.time).getTime() >= now - 6 * 3_600_000).slice(0, 60).map((p) => ({ t: new Date(p.time).getTime(), ft: Math.round(p.ft * 100) / 100 }));
  if (data.length < 2) return null;
  return (
    <div className="h-40 w-full" aria-label="Tide chart">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs><linearGradient id="tide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--salt)" stopOpacity={0.6} /><stop offset="1" stopColor="var(--salt)" stopOpacity={0.05} /></linearGradient></defs>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).toLocaleString("en-US", { hour: "numeric", timeZone: tz })} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={24} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={40} unit=" ft" />
          <Tooltip labelFormatter={(t) => hour(new Date(Number(t)).toISOString())} formatter={(v) => [`${v} ft`, "Tide"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
          <Area type="monotone" dataKey="ft" stroke="var(--salt)" fill="url(#tide)" strokeWidth={2} />
          <ReferenceLine x={now} stroke="var(--foreground)" strokeDasharray="3 3" label={{ value: "now", fontSize: 10, fill: "var(--foreground)", position: "top" }} />
          {events.filter((e) => new Date(e.time).getTime() >= data[0].t && new Date(e.time).getTime() <= data.at(-1)!.t).map((e) => (
            <ReferenceLine key={e.time} x={new Date(e.time).getTime()} stroke="transparent" label={{ value: `${e.type} ${e.ft.toFixed(1)}`, fontSize: 9, fill: "var(--muted-foreground)", position: e.type === "H" ? "insideTop" : "insideBottom" }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreStrip({ hours }: { hours: { time: string; score: number; capped: boolean }[] }) {
  const data = hours.map((h) => ({ t: h.time, s: h.score, capped: h.capped }));
  return (
    <div className="h-28 w-full" aria-label="Fishing score by hour for the next 72 hours">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={1}>
          <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: tz })} interval={11} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={34} />
          <Tooltip labelFormatter={(t) => hour(String(t))} formatter={(v, _n, p) => [`${v}${(p?.payload as { capped?: boolean })?.capped ? " (safety cap)" : ""}`, "Score"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
          <Bar dataKey="s">{data.map((d) => <Cell key={d.t} fill={d.capped ? "var(--danger)" : scoreColor(d.s)} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReportTimeline({ data }: { data: { day: string; n: number }[] }) {
  return (
    <div className="h-28 w-full" aria-label="Reports per day">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="day" tickFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })} interval={13} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={34} />
          <Tooltip formatter={(v) => [v, "Reports"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
          <Bar dataKey="n" fill="var(--verified)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
