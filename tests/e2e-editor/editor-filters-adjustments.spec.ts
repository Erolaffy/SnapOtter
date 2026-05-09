import { expect, loadTestImage, test } from "./helpers";

test.describe("Editor Filters and Adjustments", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    // Load an actual image so adjustments have a source image to work on
    await loadTestImage(page);
    // Switch to adjustments tab
    await page.locator("[data-testid='tab-adjustments']").click();
    await page.waitForTimeout(500);
  });

  test("adjustments panel is visible and has sliders", async ({ editorPage: page }) => {
    // The adjustments section header should be visible
    await expect(page.getByText("Adjustments", { exact: true }).first()).toBeVisible();

    // Check that core slider labels are present
    await expect(page.getByText("Brightness").first()).toBeVisible();
    await expect(page.getByText("Contrast").first()).toBeVisible();
    await expect(page.getByText("Saturation").first()).toBeVisible();
  });

  test("brightness slider changes canvas visually", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    const brightnessNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Brightness" })
      .locator("input[type='number']");
    await brightnessNumber.fill("50");
    await brightnessNumber.press("Enter");
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("exposure slider changes canvas visually", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    const exposureNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Exposure" })
      .locator("input[type='number']");
    await exposureNumber.fill("50");
    await exposureNumber.press("Enter");
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("vibrance slider changes canvas visually", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    const vibranceNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Vibrance" })
      .locator("input[type='number']");
    await vibranceNumber.fill("60");
    await vibranceNumber.press("Enter");
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("warmth slider changes canvas visually", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    const warmthNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Warmth" })
      .locator("input[type='number']");
    await warmthNumber.fill("40");
    await warmthNumber.press("Enter");
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("filter toggle (blur) activates and shows radius control", async ({ editorPage: page }) => {
    // Scroll to the Filters section and enable Blur
    const blurCheckbox = page
      .locator("label")
      .filter({ hasText: /^Blur$/ })
      .locator("input[type='checkbox']");
    await blurCheckbox.scrollIntoViewIfNeeded();
    await blurCheckbox.check();
    await page.waitForTimeout(300);

    // Blur checkbox should be checked
    await expect(blurCheckbox).toBeChecked();

    // Radius control should appear when Blur is enabled
    const radiusLabel = page.getByText("Radius").first();
    await expect(radiusLabel).toBeVisible();

    // Set a radius value and verify it persists
    const radiusInput = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Radius" })
      .locator("input[type='number']")
      .first();
    await radiusInput.fill("15");
    await radiusInput.press("Enter");
    await page.waitForTimeout(300);
    await expect(radiusInput).toHaveValue("15");
  });

  test("filter toggle (sharpen) activates and shows amount control", async ({
    editorPage: page,
  }) => {
    const sharpenCheckbox = page
      .locator("label")
      .filter({ hasText: /^Sharpen$/ })
      .locator("input[type='checkbox']");
    await sharpenCheckbox.scrollIntoViewIfNeeded();
    await sharpenCheckbox.check();
    await page.waitForTimeout(300);

    // Sharpen checkbox should be checked
    await expect(sharpenCheckbox).toBeChecked();

    // Amount control should appear when Sharpen is enabled
    const amountLabel = page.getByText("Amount").first();
    await expect(amountLabel).toBeVisible();

    // Set an amount value and verify it persists
    const amountInput = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Amount" })
      .locator("input[type='number']")
      .first();
    await amountInput.fill("50");
    await amountInput.press("Enter");
    await page.waitForTimeout(300);
    await expect(amountInput).toHaveValue("50");
  });

  test("filter toggle (vignette) changes canvas", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    // Scroll to the Effects section and enable Vignette
    const vignetteCheckbox = page
      .locator("label")
      .filter({ hasText: /^Vignette$/ })
      .locator("input[type='checkbox']");
    await vignetteCheckbox.scrollIntoViewIfNeeded();
    await vignetteCheckbox.check();
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("filter toggle (grain) changes canvas", async ({ editorPage: page }) => {
    test.slow();

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    const grainCheckbox = page
      .locator("label")
      .filter({ hasText: /^Grain$/ })
      .locator("input[type='checkbox']");
    await grainCheckbox.scrollIntoViewIfNeeded();
    await grainCheckbox.check();
    await page.waitForTimeout(1000);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("histogram panel shows data when image is loaded", async ({ editorPage: page }) => {
    test.slow();

    await page.waitForTimeout(500);

    // The histogram canvas element should be rendered
    const histogramCanvas = page.locator("canvas[width='256'][height='80']");
    await expect(histogramCanvas).toBeVisible();
  });

  test("reset button resets all adjustments to zero", async ({ editorPage: page }) => {
    test.slow();

    // Set a non-zero adjustment
    const brightnessNumber = page
      .locator(".flex.items-center.gap-2")
      .filter({ hasText: "Brightness" })
      .locator("input[type='number']");
    await brightnessNumber.fill("50");
    await brightnessNumber.press("Enter");
    await page.waitForTimeout(300);

    // The Reset All button should be enabled
    const resetBtn = page.locator("button").filter({ hasText: "Reset All" });
    await resetBtn.scrollIntoViewIfNeeded();
    await expect(resetBtn).toBeEnabled();

    // Click Reset All
    await resetBtn.click();
    await page.waitForTimeout(300);

    // Brightness should be back to 0
    await expect(brightnessNumber).toHaveValue("0");

    // Reset All button should now be disabled
    await expect(resetBtn).toBeDisabled();
  });
});
