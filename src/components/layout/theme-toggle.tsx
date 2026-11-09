"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEMES = ["dark", "light", "outdoor"] as const;
type Theme = (typeof THEMES)[number];
const LABEL: Record<Theme, string> = { dark: "Dark", light: "Light", outdoor: "Outdoor (high contrast)" };

/** Inline script for <head> so the saved theme applies before first paint (no flash). */
export const themeInitScript = `try{var t=localStorage.getItem("fr-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme as Theme | undefined;
    if (current && THEMES.includes(current)) setTheme(current);
  }, []);

  function cycle() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fr-theme", next);
    } catch {
      /* private mode — theme just won't persist */
    }
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : SunMedium;
  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`Theme: ${LABEL[theme]}. Click to change.`} title={LABEL[theme]}>
      <Icon />
    </Button>
  );
}
