import NextAuth, { type NextAuthConfig } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { env } from "@/lib/env";
import { enabledProviderIds } from "@/lib/auth-providers";

const providers: NextAuthConfig["providers"] = [];
const enabled = enabledProviderIds(env);

if (enabled.includes("resend")) providers.push(Resend({ apiKey: env.AUTH_RESEND_KEY, from: env.AUTH_EMAIL_FROM }));
if (enabled.includes("google")) providers.push(Google);
if (enabled.includes("apple")) providers.push(Apple);
if (enabled.includes("dev")) {
  // Local development only: one-click sign-in as a test angler. Guarded by env + NODE_ENV.
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: {},
      async authorize() {
        const email = "test-angler@fishradar.local";
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing) return existing;
        const [created] = await db
          .insert(users)
          .values({ email, name: "Test Angler", handle: "test-angler", role: "admin" })
          .returning();
        return created;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT sessions so the dev Credentials provider works; OAuth/email users are still persisted via the adapter.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
        token.role = row?.role ?? "angler";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
        session.user.role = (token.role as string) ?? "angler";
      }
      return session;
    },
  },
});
