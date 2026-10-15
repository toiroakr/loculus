import { test, expect, type Page } from "@playwright/test";

async function submitted(page: Page) {
  await expect(page.getByTestId("submitted")).toBeVisible();
  return JSON.parse((await page.getByTestId("submitted").textContent())!);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("direct nested objects and multidimensional arrays validate through the resolver", async ({ page }) => {
  await page.getByLabel("Order title").fill("Order");
  await page.getByLabel("Item name 1", { exact: true }).fill("Apple");
  await page.getByLabel("Specify delivery details").check();
  await page.getByLabel("Start time").fill("-1");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByLabel("Postal code")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Start time")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  await page.getByLabel("Postal code").fill(" 100 ");
  await page.getByLabel("Start time").fill("9");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect(await submitted(page)).toEqual({ title: "Order", items: [{ name: "Apple", quantity: 1 }], shipping: { zip: "100", windows: [[9, 17]] } });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Specify delivery details").uncheck();
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect(await submitted(page)).toEqual({ title: "Order", items: [{ name: "Apple", quantity: 1 }] });
});

test("nested errors block submission and clear after converted values are valid", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.getByLabel("Quantity 1", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByLabel("Order title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Item name 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveCount(3);
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  await page.getByLabel("Order title").fill("  Shopping  ");
  await page.getByLabel("Item name 1", { exact: true }).fill("  Apple  ");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect(await submitted(page)).toEqual({ title: "Shopping", items: [{ name: "Apple", quantity: 2 }] });
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("removing an invalid middle row preserves adjacent values and correct error indices", async ({ page }) => {
  await page.getByLabel("Order title").fill("Shopping");
  await page.getByLabel("Item name 1", { exact: true }).fill("Apple");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item name 2", { exact: true }).fill("Scheduled for deletion");
  await page.getByLabel("Quantity 2", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item name 3", { exact: true }).fill("Mandarin orange");
  await page.getByLabel("Quantity 3", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Quantity 3", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Remove item 2" }).click();
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByLabel("Item name 2", { exact: true })).toHaveValue("Mandarin orange");
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect(await submitted(page)).toEqual({ title: "Shopping", items: [
    { name: "Apple", quantity: 2 }, { name: "Mandarin orange", quantity: 3 },
  ] });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("array bounds report at the collection and recover after adding or deleting rows", async ({ page }) => {
  await page.getByLabel("Order title").fill("Shopping");
  await page.getByRole("button", { name: "Remove item 1" }).click();
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByTestId("array-error")).toHaveText("Expected at least 1 items");
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  for (let i = 1; i <= 4; i++) {
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByLabel(`Item name ${i}`, { exact: true }).fill(`Item${i}`);
  }
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByTestId("array-error")).toHaveText("Expected at most 3 items");
  await page.getByRole("button", { name: "Remove item 4" }).click();
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect((await submitted(page)).items).toHaveLength(3);
  await expect(page.getByTestId("array-error")).toHaveCount(0);
});

test("reset restores defaults and the mobile layout fits the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByRole("alert")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("item-row")).toHaveCount(1);
  await expect(page.getByLabel("Order title")).toHaveValue("");
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("numeric fields reject empty, fractional and excessive quantities", async ({ page }) => {
  await page.getByLabel("Order title").fill("Shopping");
  await page.getByLabel("Item name 1", { exact: true }).fill("Apple");
  for (const value of ["", "1.5", "100"]) {
    await page.getByLabel("Quantity 1", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Submit and validate" }).click();
    await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("submitted")).toHaveCount(0);
  }
  await page.getByLabel("Quantity 1", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect((await submitted(page)).items[0].quantity).toBe(99);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moving a row keeps its data and error attached to the new index", async ({ page }) => {
  await page.getByLabel("Order title").fill("Shopping");
  await page.getByLabel("Item name 1", { exact: true }).fill("Apple");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item name 2", { exact: true }).fill("Mandarin orange");
  await page.getByLabel("Quantity 2", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Move item 2 up" }).click();
  await expect(page.getByLabel("Item name 1", { exact: true })).toHaveValue("Mandarin orange");
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await page.getByLabel("Quantity 1", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Submit and validate" }).click();
  expect(await submitted(page)).toEqual({ title: "Shopping", items: [
    { name: "Mandarin orange", quantity: 3 }, { name: "Apple", quantity: 2 },
  ] });
  await expect(page.getByRole("alert")).toHaveCount(0);
});
