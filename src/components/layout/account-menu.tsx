import Link from "next/link";
import { UserRound } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button, buttonVariants } from "@/components/ui/button";

export async function AccountMenu() {
  const session = await auth();
  if (!session?.user) {
    return (
      <Link href="/signin" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link href="/me" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <UserRound />
        <span className="hidden sm:inline">{session.user.name ?? session.user.email}</span>
      </Link>
      {(session.user.role === "admin" || session.user.role === "moderator") && (
        <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Admin
        </Link>
      )}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <Button variant="ghost" size="sm" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );
}
