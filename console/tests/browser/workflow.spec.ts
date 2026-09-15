import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { clinicLocalInput } from "../../src/web/injection-time.js";
test("PIN, injection, stock, documentation, Tebra handoff and lock work together", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const preview = process.env.CONSOLE_PREVIEW_PATH;
  if (preview)
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) external.push(r.url());
    });
  await page.goto(preview ? pathToFileURL(preview).href : "/");
  await expect(page.getByLabel("PIN", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Patients", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("PIN", { exact: true }).fill("999999");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Injections", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/console-injections.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await page.getByRole("button", { name: "Link patient", exact: true }).click();
  await page
    .getByLabel("Patient name", { exact: true })
    .fill("Synthetic Browser Patient");
  await page.getByLabel("Date of birth", { exact: true }).fill("1991-03-15");
  await page.getByLabel("Tebra chart ID", { exact: true }).fill("BROWSER-TEST");
  await page
    .getByLabel("I verified this identity and chart ID in Tebra.", {
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Synthetic Browser Patient", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New injection", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Ordering provider", { exact: true })
    .fill("Synthetic provider");
  await page
    .getByLabel("Tebra order reference", { exact: true })
    .fill("BROWSER-ORDER");
  await page
    .getByLabel("Product / formulation", { exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Ordered dose", { exact: true }).fill("100");
  await page.getByLabel("Dose unit", { exact: true }).selectOption("mg");
  await page.getByLabel("Route", { exact: true }).selectOption("IM");
  await page
    .getByLabel("Planned injection site", { exact: true })
    .fill("Left deltoid");
  await page
    .getByLabel("Timing category", { exact: true })
    .selectOption("initiation");
  await page
    .getByLabel("Treatment phase", { exact: true })
    .selectOption("initiation");
  await page
    .getByLabel("Indication per order", { exact: true })
    .fill("Synthetic browser scenario; no patient care");
  await page
    .getByLabel("Provider-confirmed timing plan", { exact: true })
    .fill("Synthetic provider-confirmed initiation order.");
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Review injection", exact: true })
    .click();
  for (const name of [
    "identity",
    "order",
    "timing",
    "consent",
    "allergy",
    "medication",
  ])
    await page.locator(`input[name="${name}"]`).check();
  await page
    .getByLabel("Allergies / reactions reviewed", { exact: true })
    .fill("Synthetic allergy review: none reported.");
  await page
    .getByLabel("Medication-specific review", { exact: true })
    .fill("Synthetic product review and ordered initiation verified.");
  for (const label of [
    "Changes since the last visit",
    "Current symptoms and readiness",
  ]) {
    const finding = page.getByLabel(`${label} — finding`, { exact: true });
    await expect(finding).toHaveValue("");
    await finding.selectOption("no_concern");
  }
  await page
    .getByLabel("Previous treatment response — finding", { exact: true })
    .selectOption("not_applicable");
  await page
    .getByLabel("Previous treatment response — details", { exact: true })
    .fill("No prior administration in this synthetic initiation scenario.");
  await page
    .getByLabel("Provider consulted", { exact: true })
    .fill("Synthetic provider");
  await page
    .getByLabel("Provider confirmation time (America/Los_Angeles)", {
      exact: true,
    })
    .fill(
      clinicLocalInput(
        new Date(Date.now() - 60_000).toISOString(),
        "America/Los_Angeles",
      ),
    );
  await page
    .getByLabel("Provider decision", { exact: true })
    .selectOption("proceed_as_ordered");
  await page
    .getByLabel("Communication / order reference", { exact: true })
    .fill("BROWSER-ORDER");
  await page
    .getByLabel("Instructions received", { exact: true })
    .fill("Synthetic provider-confirmed initiation order; no patient care.");
  await page.getByLabel("Pulse / min", { exact: true }).fill("72");
  await page
    .getByLabel("Available stock lot", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Preparation / product checks", { exact: true })
    .fill("Synthetic package and preparation verified.");
  await page
    .getByLabel("Site assessment", { exact: true })
    .fill("Synthetic assessment complete.");
  await page
    .getByLabel("Observation plan", { exact: true })
    .fill("Synthetic provider observation plan.");
  await page
    .getByRole("button", {
      name: "Complete review & reserve stock",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record administration", exact: true })
    .click();
  await page
    .getByLabel("Delivery", { exact: true })
    .selectOption("not_delivered");
  await page.getByLabel("No route or site was used", { exact: true }).check();
  await expect(page.getByLabel("Actual route", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Actual site and laterality", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Delivery", { exact: true }).selectOption("complete");
  await expect(
    page.getByLabel("No route or site was used", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Actual route", { exact: true }).selectOption("IM");
  await page
    .getByLabel("Actual site and laterality", { exact: true })
    .fill("Left deltoid");
  await page
    .getByLabel("Tolerance / patient response", { exact: true })
    .fill("Synthetic observed response.");
  await page
    .getByLabel("Observation and follow-up", { exact: true })
    .fill("Synthetic observation completed.");
  await page
    .getByLabel("Observation outcome", { exact: true })
    .selectOption("completed");
  await page
    .getByLabel("Actual observation (minutes)", { exact: true })
    .fill("15");
  await page
    .getByLabel("Observation details", { exact: true })
    .fill("Synthetic observation scenario completed.");
  await page
    .getByLabel("Patient-specific follow-up instructions", { exact: true })
    .fill(
      "Synthetic follow-up plan: contact the test clinic for the next date.",
    );
  await page
    .getByLabel(
      "I confirm the actual delivery, time, route/site use, and patient response above.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Save administration", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Plain text", exact: true }).click();
  await expect(page.getByLabel("Injection note", { exact: true })).toHaveValue(
    /Actual dose: 100 mg/,
  );
  await expect(page.getByLabel("Injection note", { exact: true })).toHaveValue(
    /No prior administration in this synthetic initiation scenario/,
  );
  await page.screenshot({
    path: "test-results/console-injection-detail.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm filed in Tebra", exact: true })
    .click();
  await page
    .getByLabel("Tebra encounter / document reference", { exact: true })
    .fill("BROWSER-FILED");
  await page.getByRole("dialog").locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "Confirm filed", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("BROWSER-FILED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add addendum", exact: true }).click();
  await page
    .getByLabel("Reason for addendum", { exact: true })
    .fill("Synthetic correction");
  await page
    .getByLabel("Addendum", { exact: true })
    .fill("Synthetic clarification preserves the original record.");
  await page
    .getByRole("button", { name: "Save addendum", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm filed in Tebra", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole("button", { name: "Patient AVS", exact: true }).click();
  await page.getByRole("button", { name: "Print AVS", exact: true }).click();
  await expect(page.locator("#console-print-document")).toBeAttached();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#console-print-document")).toBeVisible();
  await expect(page.locator(".app-shell")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/console-avs.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.screenshot({
    path: "test-results/console-inventory.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Injections", exact: true }).click();
  await page.screenshot({
    path: "test-results/console-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.getByLabel("PIN", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Injection note", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Synthetic Browser Patient", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Synthetic Browser Patient",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  if (preview) {
    expect(external).toEqual([]);
    await page.reload();
    await expect(page.getByLabel("PIN", { exact: true })).toBeVisible();
  }
});
