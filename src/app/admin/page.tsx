import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "admin" && session.user.role !== "moderator") {
    return <ComingSoon title="Admin" phase={4}><p>You don&apos;t have access to this page.</p></ComingSoon>;
  }
  return (
    <ComingSoon title="Admin" phase={4}>
      <p>Moderation queue, report sources, ingestion health and AI cost.</p>
    </ComingSoon>
  );
}
