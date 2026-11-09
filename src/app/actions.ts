"use server";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import * as s from "@/db/schema";
import { fuzzPoint } from "@/lib/geo";
import { ingestReport } from "@/lib/ingest/pipeline";
import { rateLimit } from "@/lib/ratelimit";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user;
}
async function requireStaff() {
  const u = await requireUser();
  if (u.role !== "admin" && u.role !== "moderator") throw new Error("Forbidden");
  return u;
}

// ── Saved spots & alerts ───────────────────────────────────────────────────

export async function toggleSaveSpot(spotId: number, slug: string) {
  const u = await requireUser();
  const [existing] = await db.select().from(s.savedSpots).where(and(eq(s.savedSpots.userId, u.id), eq(s.savedSpots.spotId, spotId)));
  if (existing) await db.delete(s.savedSpots).where(and(eq(s.savedSpots.userId, u.id), eq(s.savedSpots.spotId, spotId)));
  else await db.insert(s.savedSpots).values({ userId: u.id, spotId });
  revalidatePath(`/spot/${slug}`);
  revalidatePath("/me");
}

const AlertForm = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["report", "score_above", "water_temp_below", "water_temp_above"]),
  value: z.coerce.number().optional(),
  speciesId: z.coerce.number().int().optional(),
  spotId: z.coerce.number().int().optional(),
  radiusMi: z.coerce.number().min(1).max(200).optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
});

export async function createAlert(fd: FormData) {
  const u = await requireUser();
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
  const f = AlertForm.parse(raw);
  const condition = f.type === "report" ? { type: "report" } : { type: f.type, value: f.value ?? 0 };
  await db.insert(s.alerts).values({
    userId: u.id, name: f.name, speciesId: f.speciesId ?? null, spotId: f.spotId ?? null, radiusMi: f.radiusMi ?? 25, condition,
    center: f.lat != null && f.lon != null ? { x: f.lon, y: f.lat } : null, channels: ["email"],
  });
  revalidatePath("/me");
  redirect("/me?tab=alerts&created=1");
}

export async function deleteAlert(id: number) {
  const u = await requireUser();
  await db.delete(s.alerts).where(and(eq(s.alerts.id, id), eq(s.alerts.userId, u.id)));
  revalidatePath("/me");
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, u.id), sql`read_at is null`));
  revalidatePath("/me");
}

export async function updateProfile(fd: FormData) {
  const u = await requireUser();
  const handle = String(fd.get("handle") ?? "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30) || null;
  const bio = String(fd.get("bio") ?? "").slice(0, 300);
  try {
    await db.update(s.users).set({ handle, bio, name: String(fd.get("name") ?? "").slice(0, 60) || null }).where(eq(s.users.id, u.id));
  } catch {
    redirect("/me?tab=profile&error=handle");
  }
  revalidatePath("/me");
}

// ── Catches ────────────────────────────────────────────────────────────────

const CatchForm = z.object({
  speciesId: z.coerce.number().int(),
  spotId: z.coerce.number().int().optional(),
  lureId: z.coerce.number().int().optional(),
  baitId: z.coerce.number().int().optional(),
  lureFreeText: z.string().max(80).optional(),
  lengthIn: z.coerce.number().min(0).max(200).optional(),
  weightLb: z.coerce.number().min(0).max(2000).optional(),
  caughtAt: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  privacy: z.enum(["precise", "fuzzed", "region"]).default("fuzzed"),
  released: z.enum(["on"]).optional(),
  notes: z.string().max(1000).optional(),
});

export async function logCatch(fd: FormData) {
  const u = await requireUser();
  if (!rateLimit(`catch:${u.id}`, 20, 3_600_000).ok) throw new Error("Too many catches logged in the last hour");
  const raw = Object.fromEntries([...fd.entries()].filter(([k, v]) => k !== "photo" && v !== ""));
  const f = CatchForm.parse(raw);

  let lat = f.lat;
  let lon = f.lon;
  if ((lat == null || lon == null) && f.spotId) {
    const [sp] = await db.execute<{ lat: number; lon: number }>(sql`select ST_Y(location) lat, ST_X(location) lon from spots where id = ${f.spotId}`);
    lat = sp?.lat;
    lon = sp?.lon;
  }
  let nearestSpotId = f.spotId ?? null;
  if (!nearestSpotId && lat != null && lon != null) {
    const [n] = await db.execute<{ id: number }>(sql`select id from spots order by location <-> ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) limit 1`);
    nearestSpotId = n?.id ?? null;
  }
  const fz = lat != null && lon != null ? fuzzPoint(lat, lon) : null;
  const pub = lat == null || lon == null ? null : f.privacy === "precise" ? { x: lon, y: lat } : { x: fz!.lon, y: fz!.lat };

  // Flag (don't shame) fish logged as kept that look undersized for a quick human check.
  const [c] = await db.insert(s.catches).values({
    userId: u.id, speciesId: f.speciesId, lureId: f.lureId ?? null, baitId: f.baitId ?? null, lureFreeText: f.lureFreeText ?? null,
    lengthIn: f.lengthIn ?? null, weightLb: f.weightLb ?? null, caughtAt: new Date(f.caughtAt),
    preciseLocation: lat != null && lon != null ? { x: lon, y: lat } : null, publicLocation: pub, privacy: f.privacy,
    nearestSpotId, notes: f.notes ?? null, released: f.released === "on",
  }).returning({ id: s.catches.id });

  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 12 * 1024 * 1024) throw new Error("Photo must be under 12 MB");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(photo.type)) throw new Error("Unsupported image type");
    const sharp = (await import("sharp")).default;
    // Re-encode: strips EXIF (including GPS), normalizes orientation and size.
    const buf = await sharp(Buffer.from(await photo.arrayBuffer())).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const name = `${crypto.randomUUID()}.jpg`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), buf);
    const meta = await sharp(buf).metadata();
    await db.insert(s.media).values({ url: `/uploads/${name}`, type: "image", source: "user", license: "FishRadar ToS user license", ownerUserId: u.id, catchId: c.id, width: meta.width, height: meta.height });
  }
  if (f.released !== "on" && f.lengthIn != null && f.lengthIn < 10) {
    await db.insert(s.moderationFlags).values({ targetType: "catch", targetId: c.id, reason: "Kept fish under 10 in — check against size limits", automated: true });
  }
  revalidatePath("/catches");
  redirect(`/catches/${c.id}?new=1`);
}

export async function toggleLike(catchId: string) {
  const u = await requireUser();
  const [l] = await db.select().from(s.likes).where(and(eq(s.likes.userId, u.id), eq(s.likes.catchId, catchId)));
  if (l) await db.delete(s.likes).where(and(eq(s.likes.userId, u.id), eq(s.likes.catchId, catchId)));
  else await db.insert(s.likes).values({ userId: u.id, catchId });
  revalidatePath(`/catches/${catchId}`);
  revalidatePath("/catches");
}

export async function addComment(catchId: string, fd: FormData) {
  const u = await requireUser();
  if (!rateLimit(`comment:${u.id}`, 30, 3_600_000).ok) throw new Error("Slow down");
  const body = String(fd.get("body") ?? "").trim().slice(0, 1000);
  if (!body) return;
  const spammy = /(https?:\/\/\S+.*){3,}|viagra|crypto giveaway/i.test(body);
  await db.insert(s.comments).values({ userId: u.id, catchId, body, moderation: spammy ? "pending" : "approved" });
  if (spammy) await db.insert(s.moderationFlags).values({ targetType: "comment", targetId: catchId, reason: "Possible spam", automated: true });
  revalidatePath(`/catches/${catchId}`);
}

export async function flagContent(targetType: string, targetId: string, fd: FormData) {
  const session = await auth();
  await db.insert(s.moderationFlags).values({ reporterUserId: session?.user?.id ?? null, targetType, targetId, reason: String(fd.get("reason") ?? "Reported by user").slice(0, 300) });
  revalidatePath("/admin");
}

export async function toggleFollow(userId: string, handle: string) {
  const u = await requireUser();
  if (u.id === userId) return;
  const [f] = await db.select().from(s.follows).where(and(eq(s.follows.followerId, u.id), eq(s.follows.followeeId, userId)));
  if (f) await db.delete(s.follows).where(and(eq(s.follows.followerId, u.id), eq(s.follows.followeeId, userId)));
  else await db.insert(s.follows).values({ followerId: u.id, followeeId: userId });
  revalidatePath(`/u/${handle}`);
}

// ── Partner portal ─────────────────────────────────────────────────────────

const PartnerForm = z.object({ spotId: z.coerce.number().int(), title: z.string().max(140).optional(), body: z.string().min(40).max(8000), reportDate: z.string().min(1), url: z.string().url().optional() });

export async function submitPartnerReport(fd: FormData) {
  const u = await requireUser();
  if (u.role !== "partner" && u.role !== "admin") throw new Error("Partner access required");
  if (!rateLimit(`partner:${u.id}`, 30, 3_600_000).ok) throw new Error("Too many submissions");
  const f = PartnerForm.parse(Object.fromEntries([...fd.entries()].filter(([, v]) => v !== "")));
  const [src] = await db.select().from(s.sources).where(eq(s.sources.partnerUserId, u.id)).limit(1);
  const [fallback] = src ? [src] : await db.select().from(s.sources).where(eq(s.sources.name, "FishRadar Partner Portal")).limit(1);
  const [raw] = await db.insert(s.rawSubmissions).values({ sourceId: fallback.id, submittedBy: u.id, spotId: f.spotId, title: f.title ?? null, body: f.body, url: f.url ?? null, reportDate: new Date(f.reportDate) }).returning({ id: s.rawSubmissions.id });
  const r = await ingestReport({ sourceId: fallback.id, text: `${f.title ? f.title + ". " : ""}${f.body}`, title: f.title, url: f.url, publishedAt: new Date(f.reportDate), spotHintId: f.spotId });
  await db.update(s.rawSubmissions).set({ status: r.status === "stored" || r.status === "duplicate" ? "processed" : "failed", reportId: r.reportId ?? null, error: r.status === "stored" || r.status === "duplicate" ? null : r.status }).where(eq(s.rawSubmissions.id, raw.id));
  revalidatePath("/partner");
  redirect(`/partner?result=${r.status}&review=${r.reviewStatus ?? ""}&method=${r.method ?? ""}&unmatched=${encodeURIComponent((r.unmatched ?? []).join("; "))}`);
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function adminToggleSource(id: number, field: "enabled" | "allowed") {
  await requireStaff();
  await db.update(s.sources).set({ [field]: sql`not ${field === "enabled" ? s.sources.enabled : s.sources.allowed}` }).where(eq(s.sources.id, id));
  revalidatePath("/admin");
}

const SourceForm = z.object({ name: z.string().min(2).max(100), type: z.enum(["rss", "reddit", "youtube", "web_allowlisted", "partner"]), url: z.string().url().optional(), schedule: z.string().max(40).optional(), permissionNotes: z.string().max(1000).optional(), allowed: z.enum(["on"]).optional() });

export async function adminAddSource(fd: FormData) {
  await requireStaff();
  const f = SourceForm.parse(Object.fromEntries([...fd.entries()].filter(([, v]) => v !== "")));
  await db.insert(s.sources).values({ name: f.name, type: f.type, url: f.url ?? null, schedule: f.schedule ?? "0 * * * *", permissionNotes: f.permissionNotes ?? null, allowed: f.allowed === "on", enabled: false, robotsCheckedAt: null });
  revalidatePath("/admin");
}

export async function adminReviewReport(id: number, status: "approved" | "rejected") {
  await requireStaff();
  await db.update(s.reports).set({ reviewStatus: status }).where(eq(s.reports.id, id));
  revalidatePath("/admin");
}

export async function adminResolveFlag(id: number, status: "approved" | "rejected", hide: boolean) {
  await requireStaff();
  const [f] = await db.update(s.moderationFlags).set({ status }).where(eq(s.moderationFlags.id, id)).returning();
  if (hide && f?.targetType === "catch") await db.update(s.catches).set({ moderation: "rejected" }).where(eq(s.catches.id, f.targetId));
  revalidatePath("/admin");
}

export async function adminMapUnmatched(id: number, fd: FormData) {
  await requireStaff();
  const [m] = await db.select().from(s.unmatchedMentions).where(eq(s.unmatchedMentions.id, id));
  if (!m) return;
  const target = String(fd.get("target") ?? "");
  const alias = m.rawText.toLowerCase().trim();
  if (target && m.kind === "lure") {
    const [l] = await db.select({ id: s.lures.id }).from(s.lures).where(eq(s.lures.slug, target));
    if (l) await db.insert(s.lureAliases).values({ alias, lureId: l.id }).onConflictDoNothing();
  } else if (target && m.kind === "bait") {
    const [b] = await db.select({ id: s.baits.id }).from(s.baits).where(eq(s.baits.slug, target));
    if (b) await db.insert(s.baitAliases).values({ alias, baitId: b.id }).onConflictDoNothing();
  }
  await db.update(s.unmatchedMentions).set({ status: target ? "approved" : "rejected" }).where(eq(s.unmatchedMentions.id, id));
  revalidatePath("/admin");
}

export async function adminSetRole(fd: FormData) {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Forbidden");
  const email = String(fd.get("email") ?? "").toLowerCase();
  const role = z.enum(["angler", "partner", "moderator", "admin"]).parse(fd.get("role"));
  const [target] = await db.update(s.users).set({ role }).where(eq(s.users.email, email)).returning({ id: s.users.id, name: s.users.name });
  if (target && role === "partner") {
    const [existing] = await db.select().from(s.sources).where(eq(s.sources.partnerUserId, target.id));
    if (!existing) await db.insert(s.sources).values({ name: `Partner: ${target.name ?? email}`, type: "partner", allowed: true, enabled: true, trustScore: 0.8, partnerUserId: target.id, permissionNotes: "Partner agreement on file." });
  }
  revalidatePath("/admin");
}

export async function adminRunAlerts() {
  await requireStaff();
  const { evaluateAlerts } = await import("@/lib/alerts");
  const r = await evaluateAlerts();
  redirect(`/admin?alerts=${r.fired}/${r.checked}`);
}
