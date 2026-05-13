# Restore Photo Quality Overhaul - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix catastrophic scratch over-detection, LaMa resolution loss, face over-smoothing, and excessive denoising in the restore-photo pipeline.

**Architecture:** The Python pipeline (`restore.py`) gets 4 rewrites: scratch detection (8-angle + Otsu + component filtering + coverage cap), tiled LaMa inpainting (pad for small, tile for large), face enhancement guard (min 48px, fidelity clamp for small faces), and main function (remove mode, add colorizeStrength). The TS bridge, API route, frontend, and i18n each get small schema/UI changes. All existing tests are updated to match.

**Tech Stack:** Python (OpenCV, NumPy, ONNX Runtime), TypeScript (Vitest, Zod, Fastify), React (Tailwind), Playwright

**Spec:** `docs/superpowers/specs/2026-05-13-restore-photo-quality-overhaul-design.md`

---

### Task 1: Update TypeScript bridge and unit tests

**Files:**
- Modify: `packages/ai/src/restoration.ts`
- Modify: `tests/unit/ai/restoration.test.ts`

- [ ] **Step 1: Update unit tests - remove mode, add colorizeStrength**

In `tests/unit/ai/restoration.test.ts`, make these changes:

1. Remove the test `"serializes mode option"` (lines 72-77)
2. Remove the test `"passes mode option"` (lines 358-363)
3. Update `"serializes all options together"` (lines 114-128) to remove `mode` and add `colorizeStrength`:

```typescript
it("serializes all options together", async () => {
  const allOptions = {
    scratchRemoval: true,
    faceEnhancement: true,
    fidelity: 0.8,
    denoise: true,
    denoiseStrength: 0.5,
    colorize: true,
    colorizeStrength: 75,
  };
  await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

  const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
  expect(JSON.parse(args[2])).toEqual(allOptions);
});
```

4. Add a new test for colorizeStrength serialization after the colorize test (after line 112):

```typescript
it("serializes colorizeStrength option", async () => {
  await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorizeStrength: 60 });

  const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
  expect(JSON.parse(args[2])).toEqual({ colorizeStrength: 60 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/ai/restoration.test.ts`

Expected: The `"serializes all options together"` test fails because `RestorePhotoOptions` still has `mode` and lacks `colorizeStrength`. The new `colorizeStrength` test fails because the type doesn't exist yet.

- [ ] **Step 3: Update the TypeScript bridge interface**

In `packages/ai/src/restoration.ts`, update the `RestorePhotoOptions` interface:

Remove:
```typescript
mode?: string;
```

Add:
```typescript
colorizeStrength?: number;
```

The final interface should be:
```typescript
export interface RestorePhotoOptions {
  scratchRemoval?: boolean;
  faceEnhancement?: boolean;
  fidelity?: number;
  denoise?: boolean;
  denoiseStrength?: number;
  colorize?: boolean;
  colorizeStrength?: number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/ai/restoration.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/restoration.ts tests/unit/ai/restoration.test.ts
git commit -m "refactor(ai): remove mode, add colorizeStrength to restore options"
```

---

### Task 2: Update API route schema and integration tests

**Files:**
- Modify: `apps/api/src/routes/tools/restore-photo.ts`
- Modify: `tests/integration/restore-photo.test.ts`

- [ ] **Step 1: Update the Zod schemas in the API route**

In `apps/api/src/routes/tools/restore-photo.ts`, update the `settingsSchema` (lines 21-29). Remove `mode`, add `colorizeStrength`, change `denoiseStrength` default to 25:

```typescript
const settingsSchema = z.object({
  scratchRemoval: z.boolean().default(true),
  faceEnhancement: z.boolean().default(true),
  fidelity: z.number().min(0).max(1).default(0.7),
  denoise: z.boolean().default(true),
  denoiseStrength: z.number().min(0).max(100).default(25),
  colorize: z.boolean().default(false),
  colorizeStrength: z.number().min(0).max(100).default(85),
});
```

Update the fire-and-forget processing block (lines 177-189) to pass `colorizeStrength` and remove `mode`:

```typescript
const result = await restorePhoto(
  fileBuffer,
  join(workspacePath, "output"),
  {
    scratchRemoval: settings.scratchRemoval,
    faceEnhancement: settings.faceEnhancement,
    fidelity: settings.fidelity,
    denoise: settings.denoise,
    denoiseStrength: settings.denoiseStrength,
    colorize: settings.colorize,
    colorizeStrength: settings.colorizeStrength,
  },
  onProgress,
);
```

Remove `mode: settings.mode` from the log.info call at line 158. Change to:

```typescript
log.info(
  { toolId: "restore-photo", imageSize: originalSize },
  "Starting photo restoration",
);
```

Update the `registerToolProcessFn` schema (lines 259-267) to match the same changes:

```typescript
registerToolProcessFn({
  toolId: "restore-photo",
  settingsSchema: z.object({
    scratchRemoval: z.boolean().default(true),
    faceEnhancement: z.boolean().default(true),
    fidelity: z.number().min(0).max(1).default(0.7),
    denoise: z.boolean().default(true),
    denoiseStrength: z.number().min(0).max(100).default(25),
    colorize: z.boolean().default(false),
    colorizeStrength: z.number().min(0).max(100).default(85),
  }),
```

And update the pipeline process function (lines 273-281) to remove `mode` and add `colorizeStrength`:

```typescript
const result = await restorePhoto(orientedBuffer, join(workspacePath, "output"), {
  scratchRemoval: s.scratchRemoval,
  faceEnhancement: s.faceEnhancement,
  fidelity: s.fidelity,
  denoise: s.denoise,
  denoiseStrength: s.denoiseStrength,
  colorize: s.colorize,
  colorizeStrength: s.colorizeStrength,
});
```

- [ ] **Step 2: Update integration tests**

In `tests/integration/restore-photo.test.ts`:

1. Update test `"accepts auto mode with all features enabled"` (lines 86-112). Remove `mode: "auto"` from settings, rename test:

```typescript
it("accepts all features enabled", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: JSON.stringify({
        scratchRemoval: true,
        faceEnhancement: true,
        denoise: true,
        denoiseStrength: 25,
      }),
    },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/restore-photo",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect([202, 501]).toContain(res.statusCode);
}, 60_000);
```

2. Update test `"accepts heavy mode with colorize enabled"` (lines 114-138). Remove `mode`, add `colorizeStrength`, rename test:

```typescript
it("accepts colorize with custom strength", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: JSON.stringify({
        colorize: true,
        colorizeStrength: 50,
        fidelity: 0.9,
      }),
    },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/restore-photo",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect([202, 501]).toContain(res.statusCode);
}, 60_000);
```

3. Update test `"accepts light mode with features disabled"` (lines 140-165). Remove `mode`, rename:

```typescript
it("accepts all features disabled", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: JSON.stringify({
        scratchRemoval: false,
        faceEnhancement: false,
        denoise: false,
      }),
    },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/restore-photo",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect([202, 501]).toContain(res.statusCode);
}, 60_000);
```

4. Update `"rejects invalid mode value"` test (lines 276-300). Since `mode` is no longer in the schema, an unknown `mode` field is just stripped by Zod (not rejected). Replace with a `colorizeStrength` out-of-range test:

```typescript
it("rejects colorizeStrength out of range", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: JSON.stringify({ colorizeStrength: 150 }),
    },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/restore-photo",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect([400, 501]).toContain(res.statusCode);
  if (res.statusCode === 400) {
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  }
});
```

5. Add a backward-compat test after the validation tests:

```typescript
it("ignores old mode field gracefully", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: JSON.stringify({ mode: "heavy", scratchRemoval: true }),
    },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/restore-photo",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect([202, 501]).toContain(res.statusCode);
}, 60_000);
```

- [ ] **Step 3: Run unit and integration tests**

Run: `pnpm vitest run tests/unit/ai/restoration.test.ts tests/integration/restore-photo.test.ts`

Expected: All pass. (Integration tests that hit the API will get 501 since the feature isn't installed locally, but 501 is an accepted status.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tools/restore-photo.ts tests/integration/restore-photo.test.ts
git commit -m "refactor(api): remove mode, add colorizeStrength, lower denoise default to 25"
```

---

### Task 3: Rewrite Python scratch detection

**Files:**
- Modify: `packages/ai/python/restore.py` (lines 52-127: `detect_scratches` + `_make_line_kernel`)

- [ ] **Step 1: Replace scratch detection functions**

In `packages/ai/python/restore.py`, replace lines 52-127 (the `detect_scratches` function and `_make_line_kernel` function) with:

```python
# ── Scratch detection ─────────────────────────────────────────────────

def detect_scratches(img_bgr, _sensitivity=None):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    base_dim = min(h, w)

    # Pre-filter compression artifacts before enhancement
    filtered = cv2.bilateralFilter(gray, d=5, sigmaColor=50, sigmaSpace=50)

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(filtered)

    # Adaptive kernel sizing based on image dimensions
    if base_dim < 300:
        max_k = max(9, base_dim // 15)
        kernel_sizes = [9, max_k | 1]
    else:
        kernel_sizes = [
            max(9, base_dim // 80),
            max(15, base_dim // 50),
            max(25, base_dim // 30),
        ]

    angles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5]

    # Accumulate morphological responses before thresholding
    response = np.zeros_like(gray, dtype=np.float32)

    for ksize in kernel_sizes:
        ksize = ksize | 1
        for angle in angles:
            kernel = _make_line_kernel_rotated(ksize, angle)
            blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, kernel)
            tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, kernel)
            combined = cv2.add(blackhat, tophat)
            response = np.maximum(response, combined.astype(np.float32))

    # Adaptive threshold via Otsu on the response map
    response_u8 = np.clip(response, 0, 255).astype(np.uint8)
    otsu_thresh, mask = cv2.threshold(response_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    if otsu_thresh < 60:
        return np.zeros_like(gray)

    # Connected component filtering
    mask = _filter_components(mask, h * w)

    # Post-processing
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)

    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)

    # Coverage cap: if > 15%, keep only strongest detections
    coverage = np.count_nonzero(mask) / (h * w)
    if coverage > 0.15:
        print(f"[restore] Coverage cap triggered: {coverage:.1%} > 15%, keeping strongest detections",
              file=sys.stderr, flush=True)
        masked_response = response_u8.copy()
        masked_response[mask == 0] = 0
        nonzero = masked_response[masked_response > 0]
        if len(nonzero) > 0:
            target_count = int(h * w * 0.15)
            cutoff = np.percentile(nonzero, max(0, 100 * (1 - target_count / len(nonzero))))
            _, mask = cv2.threshold(response_u8, max(cutoff, otsu_thresh), 255, cv2.THRESH_BINARY)
            mask = _filter_components(mask, h * w)

    # Dilate for cleaner inpainting boundaries
    kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.dilate(mask, kernel_dilate, iterations=2)

    return mask


def _make_line_kernel_rotated(size, angle_deg):
    kernel = np.zeros((size, size), np.uint8)
    mid = size // 2
    kernel[mid, :] = 1
    if angle_deg == 0:
        return kernel
    M = cv2.getRotationMatrix2D((float(mid), float(mid)), angle_deg, 1.0)
    rotated = cv2.warpAffine(kernel, M, (size, size),
                              flags=cv2.INTER_NEAREST,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if np.count_nonzero(rotated) == 0:
        rotated[mid, mid] = 1
    return rotated


def _filter_components(mask, total_pixels):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    max_area = int(total_pixels * 0.05)
    filtered = np.zeros_like(mask)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 20 or area > max_area:
            continue
        bw = stats[i, cv2.CC_STAT_WIDTH]
        bh = stats[i, cv2.CC_STAT_HEIGHT]
        elongation = max(bw, bh) / max(min(bw, bh), 1)
        if elongation >= 2.5 or area >= 200:
            filtered[labels == i] = 255

    return filtered
```

- [ ] **Step 2: Verify scratch detection on diagnostic images**

Run:
```bash
source /tmp/restore-venv/bin/activate && python3 -c "
import sys; sys.path.insert(0, 'packages/ai/python')
import cv2, numpy as np
from PIL import Image
from restore import detect_scratches

for path in [
    '/Users/sidd/Downloads/sample/woman-baby1.webp',
    '/Users/sidd/Downloads/sample/images2.jpg',
    '/Users/sidd/Downloads/sample/images.jpg',
    '/Users/sidd/Downloads/sample/ai-old-photo-restoration-example-before.webp',
]:
    img = Image.open(path).convert('RGB')
    img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    mask = detect_scratches(img_bgr)
    h, w = img_bgr.shape[:2]
    cov = np.count_nonzero(mask) / (h * w) * 100
    print(f'{path.split(\"/\")[-1]:50s} {cov:6.2f}%  ({w}x{h})')
"
```

Expected: All coverages should be < 15%. The small images (images2.jpg, images.jpg) should drop dramatically from 68.7%/30.6% to single digits. If any image exceeds 15%, the coverage cap should activate.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/python/restore.py
git commit -m "fix(ai): rewrite scratch detection with 8-angle Otsu and component filtering"
```

---

### Task 4: Rewrite LaMa inpainting for native resolution

**Files:**
- Modify: `packages/ai/python/restore.py` (lines 145-199: `inpaint_damage`)

- [ ] **Step 1: Replace inpaint_damage function**

In `packages/ai/python/restore.py`, replace the `inpaint_damage` function (lines 145-199) with:

```python
def inpaint_damage(img_bgr, mask):
    from gpu import safe_onnx_session

    model_path = _get_lama_path()
    session, _device = safe_onnx_session(model_path)

    orig_h, orig_w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    if orig_h <= LAMA_MODEL_SIZE and orig_w <= LAMA_MODEL_SIZE:
        inpainted_rgb = _inpaint_padded(img_rgb, mask, session)
    else:
        inpainted_rgb = _inpaint_tiled(img_rgb, mask, session)

    # Feathered composite: only replace masked areas
    mask_float = mask.astype(np.float32) / 255.0
    feather_r = max(5, min(orig_w, orig_h) // 100)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (feather_r, feather_r))
    dilated = cv2.dilate(mask_float, kernel, iterations=1)
    blur_size = feather_r * 2 + 1
    alpha = cv2.GaussianBlur(dilated, (blur_size, blur_size), 0)
    alpha = np.clip(alpha * 1.2, 0.0, 1.0)[:, :, np.newaxis]

    composited = (img_rgb.astype(np.float32) * (1.0 - alpha) +
                  inpainted_rgb.astype(np.float32) * alpha)
    composited = np.clip(composited, 0, 255).astype(np.uint8)

    return cv2.cvtColor(composited, cv2.COLOR_RGB2BGR)


def _lama_single(session, tile_rgb, tile_mask):
    img_input = tile_rgb.astype(np.float32) / 255.0
    img_input = np.transpose(img_input, (2, 0, 1))[np.newaxis, ...]
    mask_binary = (tile_mask > 127).astype(np.float32)
    mask_input = mask_binary[np.newaxis, np.newaxis, ...]
    outputs = session.run(None, {"image": img_input, "mask": mask_input})
    result = outputs[0][0]
    result = np.transpose(result, (1, 2, 0))
    return np.clip(result, 0, 255).astype(np.uint8)


def _inpaint_padded(img_rgb, mask, session):
    h, w = img_rgb.shape[:2]
    sz = LAMA_MODEL_SIZE
    pad_bottom = sz - h
    pad_right = sz - w
    padded_img = cv2.copyMakeBorder(img_rgb, 0, pad_bottom, 0, pad_right,
                                     cv2.BORDER_REFLECT_101)
    padded_mask = cv2.copyMakeBorder(mask, 0, pad_bottom, 0, pad_right,
                                      cv2.BORDER_CONSTANT, value=0)
    result = _lama_single(session, padded_img, padded_mask)
    return result[:h, :w]


def _make_cosine_window(size):
    x = np.linspace(0, np.pi, size)
    w1d = (1 - np.cos(x)) / 2
    return np.outer(w1d, w1d).astype(np.float32)


def _inpaint_tiled(img_rgb, mask, session):
    h, w = img_rgb.shape[:2]
    sz = LAMA_MODEL_SIZE
    stride = 384
    window = _make_cosine_window(sz)

    result_sum = np.zeros((h, w, 3), dtype=np.float64)
    weight_sum = np.zeros((h, w), dtype=np.float64)

    y_starts = list(range(0, max(h - sz, 0) + 1, stride))
    if len(y_starts) == 0 or y_starts[-1] + sz < h:
        y_starts.append(max(0, h - sz))

    x_starts = list(range(0, max(w - sz, 0) + 1, stride))
    if len(x_starts) == 0 or x_starts[-1] + sz < w:
        x_starts.append(max(0, w - sz))

    for y in y_starts:
        for x in x_starts:
            y2 = y + sz
            x2 = x + sz

            # Pad if tile extends beyond image
            if y2 > h or x2 > w:
                tile_img = cv2.copyMakeBorder(
                    img_rgb[y:min(y2, h), x:min(x2, w)],
                    0, max(0, y2 - h), 0, max(0, x2 - w),
                    cv2.BORDER_REFLECT_101)
                tile_mask = cv2.copyMakeBorder(
                    mask[y:min(y2, h), x:min(x2, w)],
                    0, max(0, y2 - h), 0, max(0, x2 - w),
                    cv2.BORDER_CONSTANT, value=0)
            else:
                tile_img = img_rgb[y:y2, x:x2]
                tile_mask = mask[y:y2, x:x2]

            if np.count_nonzero(tile_mask) == 0:
                tile_result = tile_img.astype(np.float64)
            else:
                tile_result = _lama_single(session, tile_img, tile_mask).astype(np.float64)

            # Clip to actual image bounds
            ey = min(y2, h) - y
            ex = min(x2, w) - x
            win = window[:ey, :ex]

            result_sum[y:y+ey, x:x+ex] += tile_result[:ey, :ex] * win[:, :, np.newaxis]
            weight_sum[y:y+ey, x:x+ex] += win

    weight_sum = np.maximum(weight_sum, 1e-8)
    result = result_sum / weight_sum[:, :, np.newaxis]
    return np.clip(result, 0, 255).astype(np.uint8)
```

- [ ] **Step 2: Verify inpainting on a sample image**

Run:
```bash
source /tmp/restore-venv/bin/activate && python3 -c "
import sys; sys.path.insert(0, 'packages/ai/python')
import cv2, numpy as np
from PIL import Image
from restore import detect_scratches, inpaint_damage

img = Image.open('/Users/sidd/Downloads/sample/woman-baby1.webp').convert('RGB')
img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
mask = detect_scratches(img_bgr)
result = inpaint_damage(img_bgr, mask)
cv2.imwrite('/tmp/restore-diagnostic/v2_inpaint.png', result)
print(f'Inpainting complete: {result.shape}')
"
```

Expected: Completes without error. Output image at `/tmp/restore-diagnostic/v2_inpaint.png` should show scratch reduction without destroying faces.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/python/restore.py
git commit -m "fix(ai): tiled LaMa inpainting at native resolution"
```

---

### Task 5: Face enhancement guard and main pipeline update

**Files:**
- Modify: `packages/ai/python/restore.py` (lines 339-414: face loop in `enhance_faces`, lines 537-674: `main`)

- [ ] **Step 1: Update enhance_faces minimum size and fidelity clamping**

In `packages/ai/python/restore.py`, in the `enhance_faces` function, change the face size check (line 345) from:

```python
if w < 24 or h < 24:
    continue
```

to:

```python
if w < 48 or h < 48:
    continue

# Clamp fidelity for small faces to prevent over-smoothing
face_fidelity = fidelity
if max(w, h) < 120:
    face_fidelity = max(fidelity, 0.85)
```

Then update line 377 where `fidelity` is used for the `weight` model input to use `face_fidelity` instead:

```python
elif name == "weight":
    model_inputs[name] = np.array([face_fidelity]).astype(np.float64)
```

- [ ] **Step 2: Rewrite the main function**

Replace the entire `main()` function (lines 537-674) with:

```python
def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    scratch_removal = settings.get("scratchRemoval", True)
    face_enhancement = settings.get("faceEnhancement", True)
    fidelity = float(settings.get("fidelity", 0.7))
    do_denoise = settings.get("denoise", True)
    denoise_strength = float(settings.get("denoiseStrength", 25))
    do_colorize = settings.get("colorize", False)
    colorize_strength = float(settings.get("colorizeStrength", 85)) / 100.0

    try:
        from gpu import gpu_available
        device = "cuda" if gpu_available() else "cpu"

        emit_progress(5, "Opening image")
        img_bgr = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if img_bgr is None:
            pil_img = Image.open(input_path).convert("RGB")
            img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        orig_h, orig_w = img_bgr.shape[:2]
        result = img_bgr.copy()
        steps_applied = []

        emit_progress(8, "Analyzing photo")
        bw_detected = is_grayscale(img_bgr)
        scratch_coverage = 0.0

        if scratch_removal:
            emit_progress(10, "Detecting damage")
            scratch_mask = detect_scratches(result)
            scratch_pixels = np.count_nonzero(scratch_mask)
            total_pixels = scratch_mask.shape[0] * scratch_mask.shape[1]
            scratch_coverage = float(scratch_pixels / total_pixels)

            if scratch_coverage > 0.001:
                emit_progress(15, f"Repairing damage ({scratch_coverage:.1%} affected)")
                result = inpaint_damage(result, scratch_mask)
                steps_applied.append("scratch_removal")
                emit_progress(30, "Damage repaired")
            else:
                emit_progress(15, "No significant damage detected")
        else:
            emit_progress(15, "Scratch removal disabled")

        faces_found = 0
        if face_enhancement:
            emit_progress(35, "Detecting faces")
            try:
                result, faces_found = enhance_faces(result, fidelity)
                if faces_found > 0:
                    steps_applied.append("face_enhancement")
                    emit_progress(65, f"Enhanced {faces_found} face{'s' if faces_found != 1 else ''}")
                else:
                    emit_progress(65, "No faces detected")
            except Exception as e:
                emit_progress(65, f"Face enhancement skipped: {str(e)[:40]}")
        else:
            emit_progress(65, "Face enhancement disabled")

        if do_denoise and denoise_strength > 0:
            emit_progress(70, "Reducing noise")
            result = denoise_image(result, denoise_strength)
            steps_applied.append("denoise")
            emit_progress(80, "Noise reduced")
        else:
            emit_progress(80, "Denoising disabled")

        colorized = False
        if do_colorize and bw_detected:
            total_pixels = orig_h * orig_w
            has_gpu = device == "cuda"
            max_pixels = 8_000_000 if has_gpu else 2_000_000

            if total_pixels > max_pixels and not has_gpu:
                mp = total_pixels / 1_000_000
                emit_progress(92, f"Colorization skipped: image too large for CPU ({mp:.1f}MP, max 2MP)")
            elif not os.path.exists(DDCOLOR_MODEL_PATH):
                emit_progress(92, "Colorization skipped: DDColor model not installed")
            else:
                emit_progress(82, "Colorizing B&W photo")
                try:
                    result, colorized = colorize_bw(result, intensity=colorize_strength)
                    if colorized:
                        steps_applied.append("colorize")
                        emit_progress(92, "Colorization complete")
                    else:
                        emit_progress(92, "Colorization model not available")
                except Exception as e:
                    emit_progress(92, f"Colorization skipped: {str(e)[:40]}")
        else:
            emit_progress(92, "Colorization skipped")

        emit_progress(95, "Saving result")
        cv2.imwrite(output_path, result)

        print(json.dumps({
            "success": True,
            "width": orig_w,
            "height": orig_h,
            "steps": steps_applied,
            "scratchCoverage": round(scratch_coverage * 100, 2),
            "facesEnhanced": faces_found,
            "isGrayscale": bw_detected,
            "colorized": colorized,
            "device": device,
            "output_path": output_path,
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
```

Key differences from current:
- No `mode` parameter, no `scratch_sensitivity`
- `denoise_strength` default is 25 (was 40)
- `colorize_strength` derived from `colorizeStrength` setting (divided by 100)
- `detect_scratches(result)` called without sensitivity arg
- Colorization uses `colorize_strength` instead of hardcoded `0.85`

- [ ] **Step 3: Run full pipeline on diagnostic images**

Run:
```bash
source /tmp/restore-venv/bin/activate && python3 -c "
import sys, os; sys.path.insert(0, 'packages/ai/python')
os.environ.setdefault('MODELS_PATH', '/opt/models')
import cv2, numpy as np
from PIL import Image
from restore import detect_scratches, inpaint_damage, enhance_faces, denoise_image

for path in ['/Users/sidd/Downloads/sample/woman-baby1.webp',
             '/Users/sidd/Downloads/sample/images2.jpg',
             '/Users/sidd/Downloads/sample/ai-old-photo-restoration-example-before.webp']:
    name = os.path.splitext(os.path.basename(path))[0]
    img = Image.open(path).convert('RGB')
    img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    mask = detect_scratches(img_bgr)
    cov = np.count_nonzero(mask) / (img_bgr.shape[0]*img_bgr.shape[1])
    print(f'{name}: mask={cov:.1%}')
    if cov > 0.001:
        img_bgr = inpaint_damage(img_bgr, mask)
    result, n = enhance_faces(img_bgr, 0.7)
    result = denoise_image(result, 25)
    cv2.imwrite(f'/tmp/restore-diagnostic/{name}_v2_final.png', result)
    print(f'  faces={n}, saved')
"
```

Expected: All complete without error. Mask coverages in single digits. Output images should preserve faces and show scratch reduction.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/python/restore.py
git commit -m "fix(ai): face guard for small faces, remove mode system, add colorizeStrength"
```

---

### Task 6: Frontend settings and i18n

**Files:**
- Modify: `apps/web/src/components/tools/restore-photo-settings.tsx`
- Modify: `packages/shared/src/i18n/en.ts`

- [ ] **Step 1: Add i18n key**

In `packages/shared/src/i18n/en.ts`, find the tools section and add `colorizeStrength`. Add it near other tool-related keys:

```typescript
colorizeStrength: "Colorize Strength",
```

- [ ] **Step 2: Update the frontend settings component**

In `apps/web/src/components/tools/restore-photo-settings.tsx`:

1. Remove the `Mode` type, `MODES` array, and mode-related state/effects (lines 7-13, 24, 37-38, 56 `mode` reference, 64 `mode` dependency, 67 `activeMode`).

2. Add `colorizeStrength` state:

```typescript
const [colorizeStrength, setColorizeStrength] = useState(85);
```

3. Add init for `colorizeStrength` in the one-time init effect:

```typescript
if (initialSettings.colorizeStrength != null)
  setColorizeStrength(Number(initialSettings.colorizeStrength));
```

4. Change denoiseStrength default from 40 to 25:

```typescript
const [denoiseStrength, setDenoiseStrength] = useState(25);
```

5. Update the settings emission effect to remove `mode` and add `colorizeStrength`:

```typescript
useEffect(() => {
  onChangeRef.current?.({
    scratchRemoval,
    faceEnhancement,
    fidelity: fidelity / 100,
    denoise,
    denoiseStrength,
    colorize,
    colorizeStrength,
  });
}, [scratchRemoval, faceEnhancement, fidelity, denoise, denoiseStrength, colorize, colorizeStrength]);
```

6. Remove the entire mode selector JSX (lines 72-91: the "Restoration Mode" label, 3-column grid, and mode description paragraph).

7. Add a colorize strength slider after the Auto-Colorize checkbox, inside the same conditional pattern as the face fidelity slider:

```tsx
{colorize && (
  <div className="pl-2 border-l-2 border-primary/20">
    <div className="flex justify-between items-center">
      <p className="text-xs text-muted-foreground">Colorize Strength</p>
      <span className="text-xs font-mono tabular-nums">{colorizeStrength}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={colorizeStrength}
      onChange={(e) => setColorizeStrength(Number(e.target.value))}
      className="w-full h-1.5 rounded-full appearance-none bg-muted accent-primary"
    />
    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
      <span>Subtle</span>
      <span>Vivid</span>
    </div>
  </div>
)}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tools/restore-photo-settings.tsx packages/shared/src/i18n/en.ts
git commit -m "feat(web): remove mode selector, add colorize strength slider"
```

---

### Task 7: Update E2E tests

**Files:**
- Modify: `tests/e2e/restore-photo.spec.ts`

- [ ] **Step 1: Update the UI controls test**

In `tests/e2e/restore-photo.spec.ts`, update the `"page loads with correct UI controls"` test (lines 35-51). Remove the mode button assertions and add colorize strength test:

```typescript
test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
  await skipIfFeatureNotInstalled(page);

  // Mode buttons should NOT be present
  await expect(page.getByRole("button", { name: "Light" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Auto" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Heavy" })).not.toBeVisible();

  // Feature checkboxes
  await expect(page.getByText("Scratch Removal")).toBeVisible();
  await expect(page.getByText("Face Enhancement")).toBeVisible();
  await expect(page.getByText("Noise Reduction")).toBeVisible();
  await expect(page.getByText("Auto-Colorize")).toBeVisible();

  // Submit button disabled with no file
  await expect(page.getByTestId("restore-photo-submit")).toBeDisabled();
});
```

2. Add a test for the colorize strength slider after the denoise strength test (after line 100):

```typescript
test("colorize strength slider visible only when auto-colorize enabled", async ({
  loggedInPage: page,
}) => {
  await skipIfFeatureNotInstalled(page);

  const strengthLabel = page.getByText("Colorize Strength");

  // Auto-colorize is OFF by default - strength hidden
  await expect(strengthLabel).not.toBeVisible();

  // Enable auto-colorize - strength visible
  await page.getByText("Auto-Colorize").click();
  await expect(strengthLabel).toBeVisible();

  // Disable auto-colorize - strength hidden again
  await page.getByText("Auto-Colorize").click();
  await expect(strengthLabel).not.toBeVisible();
});
```

3. Update `"JPG - auto mode restores and shows download"` test name (line 102) to remove "auto mode":

```typescript
test("JPG - restores and shows download", async ({ loggedInPage: page }) => {
```

- [ ] **Step 2: Run lint check**

Run: `pnpm lint`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/restore-photo.spec.ts
git commit -m "test(e2e): update restore-photo tests for mode removal and colorize strength"
```

---

### Task 8: Diagnostic verification

**Files:** None (verification only)

- [ ] **Step 1: Run full pipeline on all 4 diagnostic images**

```bash
source /tmp/restore-venv/bin/activate && python3 -c "
import sys, os; sys.path.insert(0, 'packages/ai/python')
os.environ.setdefault('MODELS_PATH', '/opt/models')
import cv2, numpy as np
from PIL import Image
from restore import detect_scratches, inpaint_damage, enhance_faces, denoise_image

samples = [
    '/Users/sidd/Downloads/sample/woman-baby1.webp',
    '/Users/sidd/Downloads/sample/images2.jpg',
    '/Users/sidd/Downloads/sample/images.jpg',
    '/Users/sidd/Downloads/sample/ai-old-photo-restoration-example-before.webp',
]
for path in samples:
    name = os.path.splitext(os.path.basename(path))[0]
    img = Image.open(path).convert('RGB')
    img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = img_bgr.shape[:2]

    mask = detect_scratches(img_bgr)
    cov = np.count_nonzero(mask) / (h * w)
    print(f'{name} ({w}x{h}): mask={cov:.1%}')

    result = img_bgr.copy()
    if cov > 0.001:
        result = inpaint_damage(result, mask)

    result, n = enhance_faces(result, 0.7)
    result = denoise_image(result, 25)

    cv2.imwrite(f'/tmp/restore-diagnostic/{name}_v2_final.png', result)
    # Save mask overlay for comparison
    overlay = img_bgr.copy()
    overlay[mask > 0] = [0, 0, 255]
    cv2.imwrite(f'/tmp/restore-diagnostic/{name}_v2_mask.png',
                cv2.addWeighted(img_bgr, 0.7, overlay, 0.3, 0))
    print(f'  faces={n}, saved to /tmp/restore-diagnostic/{name}_v2_*.png')
"
```

- [ ] **Step 2: Visually compare results**

Open each `_v2_final.png` and compare against the originals. Success criteria from the spec:

1. `images2.jpg`: faces preserved (not erased), mask < 15%
2. `images.jpg`: face unchanged, mask < 5% (minimal actual damage)
3. `woman-baby1.webp`: baby face natural, scratches reduced, mask < 15%
4. `ai-old-photo...webp`: scratches reduced, face natural, mask < 15%

- [ ] **Step 3: Run all tests**

```bash
pnpm vitest run tests/unit/ai/restoration.test.ts
pnpm vitest run tests/integration/restore-photo.test.ts
pnpm lint
pnpm typecheck
```

Expected: All pass.
