import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="rounded-md border border-seasonal bg-seasonal/10 p-2 text-xs">Placeholder — have this reviewed before launch.</p>
      <h2 className="font-semibold">Your fishing spots stay yours</h2>
      <p>Catch locations default to <b>fuzzed (~2 miles)</b>. Exact coordinates are stored only for you and are never sent to other users&apos; browsers. GPS data embedded in photos is stripped when you upload.</p>
      <h2 className="font-semibold">Location on the globe</h2>
      <p>The location you set on the globe is kept in your browser (local storage) and used to find nearby spots; it is not saved to your account.</p>
      <h2 className="font-semibold">What we store</h2>
      <p>Account info from your sign-in provider, saved spots, alerts, catches, comments and likes. AI assistant conversations are kept in your browser; the questions are sent to our AI provider to generate answers.</p>
      <h2 className="font-semibold">Deleting your data</h2>
      <p>Contact support to delete your account and content.</p>
    </article>
  );
}
