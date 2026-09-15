import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
test("patient, inventory and explicit Tebra handoff work together", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  const preview = process.env.CONSOLE_PREVIEW_PATH;
  const externalRequests: string[] = [];
  if (preview)
    page.on("request", (req) => {
      if (/^https?:/.test(req.url())) externalRequests.push(req.url());
    });
  await page.goto(preview ? pathToFileURL(preview).href : "/");
  await expect(
    page.getByText(
      preview ? "Interactive preview" : "Demonstration workspace",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A clear view of the day." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Alex Morgan \(demo\)/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/console-today.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await page.getByRole("button", { name: "Link patient", exact: true }).click();
  await page
    .getByLabel("Patient display name")
    .fill("Synthetic Browser Patient");
  await page.getByLabel("Date of birth").fill("1991-03-15");
  await page.getByLabel("Tebra chart ID").fill("BROWSER-TEST");
  await page.getByLabel("I verified this identity").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Synthetic Browser Patient", exact: true })
    .click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByLabel("Service", { exact: true }).selectOption("Injection");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Update activity", exact: true })
    .click();
  await page.getByLabel("Service progress").selectOption("completed");
  await page.getByLabel("Tebra documentation handoff").selectOption("prepared");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Prepared · not filed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Update activity", exact: true })
    .click();
  await page.getByLabel("Tebra documentation handoff").selectOption("filed");
  await page
    .getByLabel("Tebra filing reference")
    .fill("Synthetic encounter reference");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Filed in Tebra", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("button", { name: "Record movement", exact: true })
    .first()
    .click();
  await page.getByLabel("Movement", { exact: true }).selectOption("reserve");
  await page.getByLabel("Quantity in whole stock units").fill("2");
  await page
    .getByLabel("Patient", { exact: true })
    .selectOption({ label: "Synthetic Browser Patient · #BROWSER-TEST" });
  await page
    .getByLabel("Reason / operational reference")
    .fill("Synthetic patient reservation");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Synthetic patient reservation", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record movement", exact: true })
    .first()
    .click();
  await page.getByLabel("Movement", { exact: true }).selectOption("use");
  await page.getByLabel("Quantity in whole stock units").fill("1");
  await page
    .getByLabel("Patient", { exact: true })
    .selectOption({ label: "Synthetic Browser Patient · #BROWSER-TEST" });
  await page
    .getByLabel("Reason / operational reference")
    .fill("Synthetic recorded use");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Synthetic recorded use", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/console-inventory.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of the day." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/console-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
  if (preview) {
    expect(externalRequests).toEqual([]);
    await page.reload();
    await page.getByRole("button", { name: "Patients", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Synthetic Browser Patient",
        exact: true,
      }),
    ).toHaveCount(0);
  }
});
