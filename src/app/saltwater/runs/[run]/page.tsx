import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ run: string }> }) {
  redirect(`/runs/${(await params).run}`);
}
