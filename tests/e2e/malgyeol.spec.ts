import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("supports keyboard search and URL-synchronized accessible details", async ({ page }) => {
  await page.goto("/");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const search = page.getByRole("searchbox", { name: "뜻이나 느낌으로 검색" });
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();

  const firstCard = page.locator(".word-card-body").first();
  await firstCard.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\?word=/);

  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(firstCard).toBeFocused();
});

test("restores a full-dictionary favorite after reload", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "뜻이나 느낌으로 검색" });
  await search.fill("희희낙락거리다");

  const dictionaryCard = page.locator(".word-card").filter({ hasText: "희희낙락거리다" }).first();
  await expect(dictionaryCard).toBeVisible({ timeout: 30_000 });
  await dictionaryCard.getByRole("button", { name: /찜하기/ }).click();
  await expect(page.getByRole("button", { name: /찜한 낱말/ })).toContainText("1");

  await page.reload();
  await page.getByRole("button", { name: /찜한 낱말/ }).click();
  await expect(page.locator(".word-card").filter({ hasText: "희희낙락거리다" })).toBeVisible();
});
