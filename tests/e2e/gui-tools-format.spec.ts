import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Format & Conversion Tools
// (svg-to-raster, vectorize, gif-tools, image-to-pdf, pdf-to-image, favicon,
//  optimize-for-web)
// ---------------------------------------------------------------------------

test.describe("GUI Format & Conversion Tools", () => {
  // ========================================================================
  // SVG TO RASTER
  // ========================================================================
  test.describe("SVG to Raster", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");
      await expect(page.getByText("SVG to Raster").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");
      // SVG tool needs an SVG file; just verify the submit testid exists on the page
      await expect(page.getByTestId("svg-to-raster-submit")).toBeVisible();
    });

    test("shows sizing mode buttons (Scale Factor / Custom Size)", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/svg-to-raster");

      await expect(page.getByRole("button", { name: "Scale Factor" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Custom Size" })).toBeVisible();
    });

    test("shows DPI preset buttons", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");

      await expect(page.getByRole("button", { name: "72" })).toBeVisible();
      await expect(page.getByRole("button", { name: "96" })).toBeVisible();
      await expect(page.getByRole("button", { name: "150" })).toBeVisible();
      await expect(page.getByRole("button", { name: "300" })).toBeVisible();
    });

    test("shows format buttons (png, jpg, webp, avif, etc.)", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");

      await expect(page.getByRole("button", { name: /^png$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^jpg$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^webp$/i })).toBeVisible();
    });

    test("shows background mode buttons (Transparent / Color)", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");

      await expect(page.getByRole("button", { name: "Transparent" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Color" })).toBeVisible();
    });

    test("color mode shows color presets when selected", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");

      await page.getByRole("button", { name: "Color" }).click();
      // Should show white and black color buttons
      await expect(page.locator("button[aria-label='White background']")).toBeVisible();
      await expect(page.locator("button[aria-label='Black background']")).toBeVisible();
    });

    test("custom size mode shows width and height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");

      await page.getByRole("button", { name: "Custom Size" }).click();
      await expect(page.locator("#svg-custom-width")).toBeVisible();
      await expect(page.locator("#svg-custom-height")).toBeVisible();
    });
  });

  // ========================================================================
  // VECTORIZE (Image to SVG)
  // ========================================================================
  test.describe("Vectorize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await expect(page.getByText("Image to SVG").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows preset buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Presets from vectorize-settings.tsx
      await expect(page.getByRole("button", { name: /logo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /illustration/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /photo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /sketch/i }).first()).toBeVisible();
    });

    test("shows color mode toggle after upload", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Color mode: B&W / Color from vectorize-settings.tsx
      await expect(page.getByText(/color mode|b&w|black/i).first()).toBeVisible();
    });

    test("shows detail level buttons (low, medium, high)", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^low$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^medium$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^high$/i })).toBeVisible();
    });

    test("shows smoothing buttons (none, polygon, spline)", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^none$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^polygon$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^spline$/i })).toBeVisible();
    });

    test("shows invert colors toggle", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await expect(page.getByText("Invert Colors")).toBeVisible();
    });

    test("switching to color mode shows color precision slider", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Logo preset defaults to B&W -- switch to illustration for color mode
      await page.getByRole("button", { name: /^illustration$/i }).click();
      await expect(page.locator("#vectorize-color-precision")).toBeVisible();
      await expect(page.getByText("Color Precision")).toBeVisible();
    });

    test("B&W mode shows threshold slider", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Logo preset defaults to B&W
      await expect(page.locator("#vectorize-threshold")).toBeVisible();
      await expect(page.getByText("Threshold")).toBeVisible();
    });

    test("shows custom preset button", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^custom$/i })).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await expect(page.getByTestId("vectorize-submit")).toBeVisible();
    });

    test("processes vectorize and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /vectorize/i }).click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // GIF TOOLS
  // ========================================================================
  test.describe("GIF Tools", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await expect(page.getByText("GIF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode selector tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      // Mode tabs from gif-tools-settings.tsx
      await expect(page.getByRole("button", { name: "Resize" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Optimize" }).first()).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows all six mode tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Resize" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Optimize" }).first()).toBeVisible();
      // Speed, Reverse, Extract require animated GIF -- may be disabled but visible
      await expect(page.getByRole("button", { name: "Speed" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Reverse" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Extract" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Rotate" }).first()).toBeVisible();
    });

    test("resize mode shows pixel and percentage tabs", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      // Resize is default mode
      await expect(page.getByRole("button", { name: "Pixels" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Percentage" })).toBeVisible();
    });

    test("resize pixel mode shows width and height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await expect(page.locator("#gif-width")).toBeVisible();
      await expect(page.locator("#gif-height")).toBeVisible();
    });

    test("optimize mode shows colors and dither sliders", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Optimize" }).first().click();
      await expect(page.locator("#gif-colors")).toBeVisible();
      await expect(page.locator("#gif-dither")).toBeVisible();
      await expect(page.locator("#gif-effort")).toBeVisible();
    });

    test("rotate mode shows angle buttons and flip controls", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Rotate" }).first().click();
      await expect(page.getByText("Angle")).toBeVisible();
      await expect(page.getByText("Flip")).toBeVisible();
      await expect(page.getByText("Horizontal")).toBeVisible();
      await expect(page.getByText("Vertical")).toBeVisible();
    });

    test("shows loop control section", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByText("Loop")).toBeVisible();
      await expect(page.getByRole("button", { name: "Infinite" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Once" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Custom" })).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByTestId("gif-tools-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // IMAGE TO PDF
  // ========================================================================
  test.describe("Image to PDF", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-pdf");
      await expect(page.getByText("Image to PDF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows page size and orientation controls", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-pdf");

      await expect(page.getByText("Page Size")).toBeVisible();
      await expect(page.getByText("Orientation")).toBeVisible();
      await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
    });

    test("shows submit button with page count", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-pdf");

      await expect(page.getByTestId("image-to-pdf-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // PDF TO IMAGE
  // ========================================================================
  test.describe("PDF to Image", () => {
    test("renders tool page without standard dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");
      await expect(page.getByText("PDF to Image").first()).toBeVisible();

      // PDF to Image uses no-dropzone display mode with custom file input
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows format options", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");

      // Format options from pdf-to-image-settings.tsx
      await expect(page.getByText(/format/i).first()).toBeVisible();
    });

    test("shows DPI presets", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");

      // DPI buttons from pdf-to-image-settings.tsx
      await expect(page.getByText(/dpi|resolution/i).first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");

      await expect(page.getByTestId("pdf-to-image-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // FAVICON
  // ========================================================================
  test.describe("Favicon Generator", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await expect(page.getByText("Favicon").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows generate button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /generate/i }).first()).toBeVisible();
    });

    test("processes favicon generation and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await uploadTestImage(page);

      await page
        .getByRole("button", { name: /generate/i })
        .first()
        .click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // OPTIMIZE FOR WEB
  // ========================================================================
  test.describe("Optimize for Web", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await expect(page.getByText("Optimize for Web").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      // Format buttons from optimize-for-web-settings.tsx
      await expect(page.getByText(/webp|jpeg|avif|png/i).first()).toBeVisible();
    });

    test("shows quality slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/quality/i).first()).toBeVisible();
    });

    test("shows strip metadata checkbox after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/strip metadata|remove metadata/i).first()).toBeVisible();
    });

    test("shows all five format buttons", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "WebP" })).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" })).toBeVisible();
      await expect(page.getByRole("button", { name: "AVIF" })).toBeVisible();
      await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
      await expect(page.getByRole("button", { name: "JXL" })).toBeVisible();
    });

    test("quality slider hidden for PNG format", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "PNG" }).click();
      await expect(page.locator("#web-quality")).not.toBeVisible();
    });

    test("quality slider visible for WebP format", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "WebP" }).click();
      await expect(page.locator("#web-quality")).toBeVisible();
    });

    test("shows collapsible Max Dimensions section", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText("Max Dimensions")).toBeVisible();

      // Click to expand
      await page.getByText("Max Dimensions").click();
      await expect(page.locator("#max-width")).toBeVisible();
      await expect(page.locator("#max-height")).toBeVisible();
    });

    test("strip metadata toggle is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      const toggle = page.locator("#strip-meta");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-checked", "true");

      // Toggle off
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });
});
