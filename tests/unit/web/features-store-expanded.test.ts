// @vitest-environment jsdom
/**
 * Expanded tests for features-store covering edge cases not in the main test.
 *
 * Focuses on: queuing behavior during concurrent installs, recovery of
 * active installs, startTimes tracking, and installAllActive edge paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  static reset() {
    FakeEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

import type { FeatureBundleState } from "@snapotter/shared";
import { useFeaturesStore } from "@/stores/features-store";

function makeBundleState(
  overrides: Partial<FeatureBundleState> & { id: string },
): FeatureBundleState {
  return {
    name: overrides.id,
    description: "Test bundle",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "100 MB",
    enablesTools: [],
    progress: null,
    error: null,
    ...overrides,
  };
}

describe("useFeaturesStore (expanded)", () => {
  beforeEach(() => {
    useFeaturesStore.setState({
      bundles: [],
      loaded: false,
      loadError: false,
      installing: {},
      errors: {},
      queued: [],
      installAllActive: false,
      startTimes: {},
    });
    vi.clearAllMocks();
    FakeEventSource.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("startTimes tracking", () => {
    it("records startTime when install begins", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-1" });

      const promise = useFeaturesStore.getState().installBundle("timing-bundle");

      await vi.waitFor(() => {
        const times = useFeaturesStore.getState().startTimes;
        expect(times["timing-bundle"]).toBeTypeOf("number");
      });

      const es = FakeEventSource.instances[0];
      es?.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });

      await promise;
    });
  });

  describe("fetch edge cases", () => {
    it("sets loadError false on success after previous error", async () => {
      useFeaturesStore.setState({ loaded: true, loadError: true });
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().fetch();

      expect(useFeaturesStore.getState().loadError).toBe(false);
    });

    it("recovers multiple active installs", async () => {
      const bundles = [
        makeBundleState({
          id: "bundle-a",
          status: "installing",
          progress: { percent: 20, stage: "Step A" },
        }),
        makeBundleState({
          id: "bundle-b",
          status: "installing",
          progress: { percent: 50, stage: "Step B" },
        }),
        makeBundleState({
          id: "bundle-c",
          status: "installed",
        }),
      ];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      const state = useFeaturesStore.getState();
      expect(state.installing["bundle-a"]).toBeDefined();
      expect(state.installing["bundle-a"].percent).toBe(20);
      expect(state.installing["bundle-b"]).toBeDefined();
      expect(state.installing["bundle-b"].percent).toBe(50);
      expect(state.installing["bundle-c"]).toBeUndefined();
    });

    it("uses fallback progress for recovering installs without progress data", async () => {
      const bundles = [
        makeBundleState({
          id: "no-progress-bundle",
          status: "installing",
          progress: null,
        }),
      ];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      const installing = useFeaturesStore.getState().installing["no-progress-bundle"];
      expect(installing).toBeDefined();
      expect(installing.percent).toBe(0);
      expect(installing.stage).toBe("Resuming...");
    });
  });

  describe("installBundle queuing edge cases", () => {
    it("does not duplicate already-queued bundles", async () => {
      // Set up a bundle that is already installing
      useFeaturesStore.setState({
        installing: { "active-bundle": { percent: 50, stage: "Processing..." } },
        bundles: [
          makeBundleState({ id: "active-bundle", status: "installing" }),
          makeBundleState({ id: "waiting-bundle", status: "not_installed" }),
        ],
      });

      // Start install for waiting-bundle; it should queue
      const p1 = useFeaturesStore.getState().installBundle("waiting-bundle");
      const p2 = useFeaturesStore.getState().installBundle("waiting-bundle");

      await vi.waitFor(() => {
        // Should only be queued once
        const q = useFeaturesStore.getState().queued;
        expect(q.filter((id) => id === "waiting-bundle").length).toBeLessThanOrEqual(1);
      });

      // Clean up: finish the active install so queued ones proceed
      useFeaturesStore.setState({ installing: {} });
      apiPostMock.mockResolvedValue({ jobId: "job-wait" });

      await vi
        .waitFor(() => {
          if (FakeEventSource.instances.length > 0) return;
          throw new Error("waiting");
        })
        .catch(() => {});

      for (const es of FakeEventSource.instances) {
        es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      }

      await Promise.allSettled([p1, p2]);
    });
  });

  describe("installBundle skips already-installed bundles from queue", () => {
    it("skips bundle that got installed while queued", async () => {
      useFeaturesStore.setState({
        installing: { "first-bundle": { percent: 80, stage: "Finishing" } },
        bundles: [
          makeBundleState({ id: "first-bundle", status: "installing" }),
          makeBundleState({ id: "second-bundle", status: "installed" }),
        ],
      });

      // second-bundle is already installed, so should skip
      const promise = useFeaturesStore.getState().installBundle("second-bundle");

      // Clear the active install to unblock
      useFeaturesStore.setState({ installing: {} });

      await promise;

      // apiPost should not have been called for second-bundle since it is installed
      const installCalls = apiPostMock.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && (call[0] as string).includes("second-bundle"),
      );
      expect(installCalls.length).toBe(0);
    });
  });

  describe("uninstallBundle edge cases", () => {
    it("refreshes bundles after successful uninstall", async () => {
      apiPostMock.mockResolvedValueOnce({});
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().uninstallBundle("some-bundle");

      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
    });
  });

  describe("clearError", () => {
    it("does not affect other errors when clearing one", () => {
      useFeaturesStore.setState({
        errors: { a: "Error A", b: "Error B", c: "Error C" },
      });

      useFeaturesStore.getState().clearError("b");

      const errors = useFeaturesStore.getState().errors;
      expect(errors.a).toBe("Error A");
      expect(errors.b).toBeUndefined();
      expect(errors.c).toBe("Error C");
    });
  });

  describe("isToolInstalled edge cases", () => {
    it("returns true for unknown tools (no bundle requirement)", () => {
      // A tool not in TOOL_BUNDLE_MAP has no bundle dependency
      expect(useFeaturesStore.getState().isToolInstalled("resize")).toBe(true);
      expect(useFeaturesStore.getState().isToolInstalled("compress")).toBe(true);
    });

    it("handles installing status as not installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "installing",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(false);
    });

    it("handles error status as not installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "error",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(false);
    });
  });

  describe("getBundleForTool edge cases", () => {
    it("returns null when bundles array is empty", () => {
      useFeaturesStore.setState({ bundles: [] });
      const result = useFeaturesStore.getState().getBundleForTool("remove-background");
      expect(result).toBeNull();
    });
  });

  describe("refresh", () => {
    it("updates bundles even when already loaded", async () => {
      useFeaturesStore.setState({
        loaded: true,
        bundles: [makeBundleState({ id: "old" })],
      });

      const newBundles = [makeBundleState({ id: "new-bundle" })];
      apiGetMock.mockResolvedValueOnce({ bundles: newBundles });

      await useFeaturesStore.getState().refresh();

      expect(useFeaturesStore.getState().bundles).toEqual(newBundles);
    });
  });
});
