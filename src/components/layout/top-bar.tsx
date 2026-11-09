import Link from "next/link";
import { Suspense } from "react";
import { Radar } from "lucide-react";
import { SECONDARY_LINKS } from "@/lib/nav";
import { AccountMenu } from "./account-menu";
import { ModeToggle } from "./mode-toggle";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";

export function TopBar() {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
        <Radar className="size-6 text-primary" aria-hidden />
        <span>
          FishRadar <span className="text-primary">AI</span>
        </span>
      </Link>
      <div className="order-2 w-full sm:order-none sm:w-auto">
        <Suspense>
          <ModeToggle />
        </Suspense>
      </div>
      <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
        <SearchBox />
      </div>
      <nav aria-label="Sections" className="hidden items-center gap-3 text-sm text-muted-foreground lg:flex">
        {SECONDARY_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="order-1 ml-auto flex items-center gap-1 sm:order-none sm:ml-0">
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
