import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL || "http://localhost:3002";
const outDir = join(process.cwd(), ".data", "visual-audit");
mkdirSync(outDir, { recursive: true });

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

const routes = [
  { id: "01-dashboard", path: "/" },
  { id: "02-explore", path: "/explore" },
  { id: "03-theses", path: "/theses" },
  { id: "08-portfolio", path: "/portfolio" },
  { id: "auth", path: "/auth" },
];

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: desktop, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  for (const route of routes) {
    await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, `${route.id}-desktop`);
  }

  // Dashboard + Ask Thesis open
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const ask = page.getByRole("button", { name: "Ask Thesis" });
  if (await ask.count()) {
    await ask.click();
    await page.waitForTimeout(600);
    await shot(page, "09-assistant-desktop");
    const close = page.getByRole("button", { name: "Close Ask Thesis" });
    if (await close.count()) await close.click();
  }

  // Start thesis dialog
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const start = page.getByRole("button", { name: /Start a thesis/i }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(600);
    await shot(page, "09-start-thesis-desktop");
  }

  // Mobile pass
  await page.setViewportSize(mobile);
  for (const route of routes.slice(0, 3)) {
    await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await shot(page, `${route.id}-mobile`);
  }

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
