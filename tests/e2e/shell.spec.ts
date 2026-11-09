import { expect, test } from "@playwright/test";

test("home shows the app shell, mode toggle and legend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /FishRadar/ })).toBeVisible();
  const modes = page.getByRole("navigation", { name: "Water type" });
  for (const m of ["Saltwater", "Freshwater", "Runs"]) await expect(modes.getByRole("link", { name: m })).toBeVisible();
  await expect(page.getByText("Verified report", { exact: true })).toBeVisible();
  await expect(page.getByText("AI prediction", { exact: true })).toBeVisible();
});

test("mode toggle navigates and marks the active tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Water type" }).getByRole("link", { name: "Freshwater" }).click();
  await expect(page).toHaveURL(/\/freshwater$/);
  await expect(page.getByRole("link", { name: "Freshwater", exact: true })).toHaveAttribute("aria-current", "page");
});

test("every main route renders", async ({ page }) => {
  for (const path of ["/saltwater", "/freshwater", "/runs", "/lures", "/catches", "/catches/new", "/assistant", "/me",
    "/spot/montauk-point", "/spot/montauk-point/species/striped-bass", "/saltwater/runs/striper-fall", "/lures/sp-minnow", "/species/striped-bass", "/signin"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("theme toggle cycles and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Theme: Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("health endpoint reports DB and extensions", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true, extensions: ["postgis", "vector"] });
});
