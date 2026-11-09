import { expect, test } from "@playwright/test";

test("home shows the globe, controls, legend and spot shortcuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /FishRadar/ })).toBeVisible();
  const modes = page.getByRole("navigation", { name: "Water type" });
  for (const m of ["Saltwater", "Freshwater", "Runs"]) await expect(modes.getByRole("link", { name: m })).toBeVisible();
  await expect(page.getByText("Verified report", { exact: true })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box!.height).toBeGreaterThan(250);
});

test("clicking a spot shortcut opens the side panel preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Montauk Point" }).click();
  await expect(page.getByRole("heading", { name: "Montauk Point" })).toBeVisible();
  await expect(page.getByText("What's running")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open full spot report/ })).toBeVisible();
});

test("mode toggle navigates and marks the active tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Water type" }).getByRole("link", { name: "Freshwater" }).click();
  await expect(page).toHaveURL(/\/freshwater$/);
  await expect(page.getByRole("link", { name: "Freshwater", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Freshwater", level: 1 })).toBeVisible();
});

test("every main route renders", async ({ page }) => {
  for (const path of ["/saltwater", "/freshwater", "/runs", "/runs/striper-fall-run", "/lures", "/lures/daiwa-sp-minnow", "/species/striped-bass", "/catches", "/assistant", "/search?q=albie", "/sources", "/terms", "/privacy", "/partner", "/signin",
    "/spot/montauk-point-ny", "/spot/lake-winnipesaukee-nh", "/spot/hampton-harbor-nh/species/striped-bass"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
  expect((await page.goto("/spot/does-not-exist"))?.status()).toBe(404);
});

test("spot page shows score, conditions, species, lures, reports and regulations link", async ({ page }) => {
  await page.goto("/spot/montauk-point-ny");
  await expect(page.getByRole("heading", { name: "Montauk Point", level: 1 })).toBeVisible();
  await expect(page.getByLabel(/Fishing Score \d+ out of 100/).first()).toBeVisible();
  for (const h of ["What's running now", "Conditions now & forecast", "Best times to fish", "All species you can catch here", "Top lures & bait working here", "Latest fishing reports", "Access & info"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await page.getByText("Why this score?").first().click();
  await expect(page.getByText(/recent reports|season/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /official fishing regulations/ })).toHaveAttribute("href", /^https:\/\//);
});

test("run tracker shows the timing table and a labeled AI prediction", async ({ page }) => {
  await page.goto("/runs/striper-fall-run");
  await expect(page.getByRole("heading", { name: /Where it's heading next/ })).toBeVisible();
  await expect(page.getByText(/AI prediction/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "This year vs. a typical year" })).toBeVisible();
});

test("assistant answers in offline mode with citations", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByLabel("Your question").fill("What's working at Montauk for striped bass?");
  await page.getByRole("button", { name: /Ask/ }).click();
  await expect(page.getByText(/Offline mode: this answer/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Montauk Point/).first()).toBeVisible();
});

test("theme toggle cycles and persists", async ({ page }) => {
  await page.goto("/terms");
  await page.getByRole("button", { name: /Theme: Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("no horizontal scroll on key pages", async ({ page }) => {
  for (const path of ["/", "/spot/montauk-point-ny", "/runs/striper-fall-run", "/lures"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("health endpoint reports DB and extensions", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true, extensions: ["postgis", "vector"] });
});

test("public APIs never expose precise catch coordinates", async ({ request, page }) => {
  const spots = await (await request.get("/api/spots")).json();
  expect(spots.markers.length).toBeGreaterThan(50);
  await page.goto("/catches");
  const html = await page.content();
  expect(html).not.toContain("precise_location");
  expect(html).not.toContain("preciseLocation");
});
