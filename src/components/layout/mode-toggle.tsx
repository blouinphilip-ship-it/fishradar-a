"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MODES, modeFromPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = modeFromPath(pathname, params.get("mode"));

  return (
    <nav aria-label="Water type" className="flex w-full rounded-lg border border-border bg-surface p-0.5 sm:w-auto">
      {MODES.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          aria-current={active === m.id ? "page" : undefined}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            active === m.id && m.id === "saltwater" && "bg-salt text-white hover:text-white",
            active === m.id && m.id === "freshwater" && "bg-fresh text-white hover:text-white",
            active === m.id && m.id === "runs" && "bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}
