import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + DB/extension check. Used by docker-compose and uptime monitors. */
export async function GET() {
  try {
    const rows = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname in ('postgis','vector')`,
    );
    const extensions = rows.map((r) => r.extname).sort();
    const ok = extensions.includes("postgis") && extensions.includes("vector");
    return NextResponse.json({ ok, db: "up", extensions }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
