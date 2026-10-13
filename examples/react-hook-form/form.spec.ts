import { test, expect, type Page } from "@playwright/test";

async function submitted(page: Page) {
  await expect(page.getByTestId("submitted")).toBeVisible();
  return JSON.parse((await page.getByTestId("submitted").textContent())!);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("direct nested objects and multidimensional arrays validate through the resolver", async ({ page }) => {
  await page.getByLabel("注文名").fill("Order");
  await page.getByLabel("商品名 1", { exact: true }).fill("Apple");
  await page.getByLabel("配送先を指定する").check();
  await page.getByLabel("開始時刻").fill("-1");
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByLabel("郵便番号")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("開始時刻")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  await page.getByLabel("郵便番号").fill(" 100 ");
  await page.getByLabel("開始時刻").fill("9");
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect(await submitted(page)).toEqual({ title: "Order", items: [{ name: "Apple", quantity: 1 }], shipping: { zip: "100", windows: [[9, 17]] } });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("配送先を指定する").uncheck();
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect(await submitted(page)).toEqual({ title: "Order", items: [{ name: "Apple", quantity: 1 }] });
});

test("nested errors block submission and clear after converted values are valid", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.getByLabel("数量 1", { exact: true }).fill("0");
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByLabel("注文名")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("商品名 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("数量 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveCount(3);
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  await page.getByLabel("注文名").fill("  買い物  ");
  await page.getByLabel("商品名 1", { exact: true }).fill("  りんご  ");
  await page.getByLabel("数量 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect(await submitted(page)).toEqual({ title: "買い物", items: [{ name: "りんご", quantity: 2 }] });
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("removing an invalid middle row preserves adjacent values and correct error indices", async ({ page }) => {
  await page.getByLabel("注文名").fill("買い物");
  await page.getByLabel("商品名 1", { exact: true }).fill("りんご");
  await page.getByLabel("数量 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByLabel("商品名 2", { exact: true }).fill("削除予定");
  await page.getByLabel("数量 2", { exact: true }).fill("0");
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByLabel("商品名 3", { exact: true }).fill("みかん");
  await page.getByLabel("数量 3", { exact: true }).fill("3");
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByLabel("数量 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("数量 3", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "商品 2 を削除" }).click();
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByLabel("商品名 2", { exact: true })).toHaveValue("みかん");
  await expect(page.getByLabel("数量 2", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect(await submitted(page)).toEqual({ title: "買い物", items: [
    { name: "りんご", quantity: 2 }, { name: "みかん", quantity: 3 },
  ] });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("array bounds report at the collection and recover after adding or deleting rows", async ({ page }) => {
  await page.getByLabel("注文名").fill("買い物");
  await page.getByRole("button", { name: "商品 1 を削除" }).click();
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByTestId("array-error")).toHaveText("Expected at least 1 items");
  await expect(page.getByTestId("submitted")).toHaveCount(0);
  for (let i = 1; i <= 4; i++) {
    await page.getByRole("button", { name: "商品を追加" }).click();
    await page.getByLabel(`商品名 ${i}`, { exact: true }).fill(`商品${i}`);
  }
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByTestId("array-error")).toHaveText("Expected at most 3 items");
  await page.getByRole("button", { name: "商品 4 を削除" }).click();
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect((await submitted(page)).items).toHaveLength(3);
  await expect(page.getByTestId("array-error")).toHaveCount(0);
});

test("reset restores defaults and the mobile layout fits the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByRole("alert")).not.toHaveCount(0);
  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.getByTestId("item-row")).toHaveCount(1);
  await expect(page.getByLabel("注文名")).toHaveValue("");
  await expect(page.getByLabel("数量 1", { exact: true })).toHaveValue("1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("numeric fields reject empty, fractional and excessive quantities", async ({ page }) => {
  await page.getByLabel("注文名").fill("買い物");
  await page.getByLabel("商品名 1", { exact: true }).fill("りんご");
  for (const value of ["", "1.5", "100"]) {
    await page.getByLabel("数量 1", { exact: true }).fill(value);
    await page.getByRole("button", { name: "送信して検証" }).click();
    await expect(page.getByLabel("数量 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("submitted")).toHaveCount(0);
  }
  await page.getByLabel("数量 1", { exact: true }).fill("99");
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect((await submitted(page)).items[0].quantity).toBe(99);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moving a row keeps its data and error attached to the new index", async ({ page }) => {
  await page.getByLabel("注文名").fill("買い物");
  await page.getByLabel("商品名 1", { exact: true }).fill("りんご");
  await page.getByLabel("数量 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByLabel("商品名 2", { exact: true }).fill("みかん");
  await page.getByLabel("数量 2", { exact: true }).fill("0");
  await page.getByRole("button", { name: "送信して検証" }).click();
  await expect(page.getByLabel("数量 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "商品 2 を上へ移動" }).click();
  await expect(page.getByLabel("商品名 1", { exact: true })).toHaveValue("みかん");
  await expect(page.getByLabel("数量 1", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("数量 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("数量 2", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await page.getByLabel("数量 1", { exact: true }).fill("3");
  await page.getByRole("button", { name: "送信して検証" }).click();
  expect(await submitted(page)).toEqual({ title: "買い物", items: [
    { name: "みかん", quantity: 3 }, { name: "りんご", quantity: 2 },
  ] });
  await expect(page.getByRole("alert")).toHaveCount(0);
});
