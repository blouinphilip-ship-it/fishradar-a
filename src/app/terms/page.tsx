import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="rounded-md border border-seasonal bg-seasonal/10 p-2 text-xs">Placeholder — have this reviewed by a lawyer before launch.</p>
      <h2 className="font-semibold">Fishing information</h2>
      <p>Conditions, forecasts, scores and AI answers are informational and may be wrong or out of date. AI predictions are not guarantees. You are responsible for your own safety on the water and for following all fishing regulations, licensing rules, closures and size/bag limits.</p>
      <h2 className="font-semibold">Your content</h2>
      <p>You keep ownership of photos, catches and comments you post. You grant FishRadar a non-exclusive, worldwide, royalty-free license to host, display and distribute that content within the service. Don&apos;t post content you don&apos;t have the rights to.</p>
      <h2 className="font-semibold">Partners</h2>
      <p>Partners who submit reports confirm they have the right to share them and grant FishRadar a license to display summaries with attribution and a link back.</p>
      <h2 className="font-semibold">Copyright (DMCA)</h2>
      <p>To report infringing content, contact dmca@your-domain.example with the URL and details. Staff can remove content using the admin takedown tools.</p>
      <h2 className="font-semibold">Affiliate links</h2>
      <p>Some product links are affiliate links; we may earn a commission.</p>
    </article>
  );
}
