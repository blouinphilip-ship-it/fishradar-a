import type { Metadata } from "next";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enabledProviderIds } from "@/lib/auth-providers";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const providers = enabledProviderIds(env);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">Sign in to FishRadar AI</h1>
      <p className="mt-1 text-sm text-muted-foreground">Save spots, log catches and get run alerts.</p>
      <div className="mt-6 space-y-3">
        {providers.includes("resend") && (
          <form
            className="space-y-2"
            action={async (fd) => {
              "use server";
              await signIn("resend", { email: String(fd.get("email")), redirectTo: "/" });
            }}
          >
            <Input type="email" name="email" required placeholder="you@example.com" aria-label="Email" />
            <Button className="w-full" type="submit">Email me a sign-in link</Button>
          </form>
        )}
        {(["google", "apple"] as const)
          .filter((p) => providers.includes(p))
          .map((p) => (
            <form
              key={p}
              action={async () => {
                "use server";
                await signIn(p, { redirectTo: "/" });
              }}
            >
              <Button variant="outline" className="w-full" type="submit">
                Continue with {p === "google" ? "Google" : "Apple"}
              </Button>
            </form>
          ))}
        {providers.includes("dev") && (
          <form
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/" });
            }}
          >
            <Button variant="secondary" className="w-full" type="submit">Dev login (test angler, local only)</Button>
          </form>
        )}
        {providers.length === 0 && (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            No sign-in methods are configured yet. Add Google, Apple or Resend keys to <code>.env.local</code> (see{" "}
            <code>.env.example</code>), or set <code>ENABLE_DEV_LOGIN=true</code> for local development.
          </p>
        )}
      </div>
    </div>
  );
}
