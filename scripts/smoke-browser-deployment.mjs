import { chromium } from "@playwright/test";

const retryCount = 12;
const retryDelayMs = 5_000;
const deployedUrl = String(process.env.DEPLOYED_URL || "").trim();
const productionFallbackUrl = String(
  process.env.PRODUCTION_FALLBACK_URL || "",
).trim();
const isProduction = String(process.env.IS_PRODUCTION || "") === "true";
const target = deployedUrl || (isProduction ? productionFallbackUrl : "");

if (!target) {
  throw new Error(
    "Azure did not return a preview URL, so the deployed workstation could not be tested in Chromium.",
  );
}

const baseUrl = new URL(target);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const describeError = (error) =>
  error instanceof Error ? error.message : String(error);

const requireVisible = async (page, selector, description) => {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  if ((await locator.count()) < 1) {
    throw new Error(`${description} was not found.`);
  }
};

const verifyNoPageOverflow = async (page, widthLabel) => {
  const dimensions = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  const tolerance = 1;
  const bodyOverflows =
    dimensions.bodyScrollWidth > dimensions.viewportWidth + tolerance;
  const documentOverflows =
    dimensions.documentScrollWidth >
    dimensions.documentClientWidth + tolerance;
  if (bodyOverflows || documentOverflows) {
    throw new Error(
      `${widthLabel} page overflows horizontally: ${JSON.stringify(dimensions)}`,
    );
  }
};

const browser = await chromium.launch({ headless: true });
let passedUrl = "";
let finalError;

try {
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const runtimeErrors = [];

    page.on("pageerror", (error) => {
      runtimeErrors.push(`pageerror: ${describeError(error)}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(`console.error: ${message.text()}`);
      }
    });

    try {
      const response = await page.goto(baseUrl.href, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response?.ok()) {
        throw new Error(
          `Navigation returned ${response?.status() ?? "no response"} for ${baseUrl.href}`,
        );
      }

      await page
        .locator('body[data-application-ready="true"]')
        .waitFor({ state: "attached", timeout: 20_000 });
      await requireVisible(page, ".cd2004-shell", "The classic workstation shell");
      await requireVisible(
        page,
        ".cd2004-start-center",
        "The workstation start center",
      );

      const initialWorkflow = await page
        .locator(".cd2004-shell")
        .getAttribute("data-active-workflow");
      if (initialWorkflow !== "home") {
        throw new Error(
          `The deployed workstation did not open at the start center (active workflow: ${initialWorkflow || "missing"}).`,
        );
      }

      await verifyNoPageOverflow(page, "Desktop");

      const injectionLauncher = page
        .locator(".cd2004-launcher")
        .filter({ hasText: "Injection" })
        .first();
      await injectionLauncher.click();
      await page
        .locator('.cd2004-shell[data-active-workflow="administer"]')
        .waitFor({ state: "visible", timeout: 10_000 });
      await requireVisible(
        page,
        '.cd2004-workflow-slot[data-workflow="administer"]',
        "The Injection workflow",
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await requireVisible(
        page,
        ".cd2004-mobile-switcher",
        "The narrow-window task switcher",
      );

      const noteTab = page.locator("#cd2004-pane-tab-inspector");
      await noteTab.click();
      await requireVisible(
        page,
        "#cd2004-pane-inspector",
        "The narrow-window Note / Readiness pane",
      );

      const workTab = page.locator("#cd2004-pane-tab-work");
      await workTab.click();
      await requireVisible(
        page,
        '.cd2004-workflow-slot[data-workflow="administer"]',
        "The narrow-window Injection workflow",
      );
      await verifyNoPageOverflow(page, "390px");

      await page.waitForTimeout(150);
      if (runtimeErrors.length) {
        throw new Error(
          `The deployed workstation emitted browser errors:\n${runtimeErrors.join("\n")}`,
        );
      }

      passedUrl = page.url();
      await context.close();
      break;
    } catch (error) {
      finalError = error;
      await context.close();
      if (attempt < retryCount) {
        console.warn(
          `Browser deployment smoke attempt ${attempt}/${retryCount} failed: ${describeError(error)}`,
        );
        await pause(retryDelayMs);
      }
    }
  }
} finally {
  await browser.close();
}

if (passedUrl) {
  console.log(`Browser deployment smoke passed: ${passedUrl}`);
} else {
  throw new Error(
    `Browser deployment smoke failed for ${baseUrl.href}: ${describeError(finalError)}`,
  );
}
