import { readFileSync } from "node:fs";
import { flushPromises, mount } from "@vue/test-utils";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";

vi.mock("@/utils/riskWebGL", () => ({ canRiskWebGL: () => true }));

const chinaText = readFileSync("public/maps/risk-v1/china.geojson", "utf8");
const worldText = readFileSync("public/maps/risk-v1/world.geojson", "utf8");
const detailTexts: Record<string, string> = {
  "310000": readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8"),
  "320000": readFileSync("public/maps/risk-detail-v2/china/320000.geojson", "utf8"),
  "330000": readFileSync("public/maps/risk-detail-v2/china/330000.geojson", "utf8"),
};
const RiskMap3DStub = {
  name: "RiskMap3D",
  props: ["kind", "mapName", "geo", "baseGeo", "viewportDetails", "counts", "flows", "camera", "detail", "reducedMotion", "serverTarget", "height"],
  emits: ["regionSelect", "cameraChange", "failed", "viewportParents"],
  template: "<div data-map-3d />",
};
const RiskMapCanvasStub = {
  name: "RiskMapCanvas",
  props: ["option", "accessibleLabel", "kind", "height"],
  emits: ["regionSelect"],
  template: "<div data-map-canvas />",
};

interface PendingDetail {
  key: string;
  signal?: AbortSignal;
  resolve: (text: string) => void;
}

const pending: PendingDetail[] = [];
const wrappers: ReturnType<typeof mount>[] = [];

function response(text: string): Response {
  return { ok: true, text: async () => text } as Response;
}

function render() {
  const wrapper = mount(RiskRegionMap, {
    props: { regions: [{ regionCode: "CN-31", requestCount: "7" }] },
    global: { stubs: { RiskMap3D: RiskMap3DStub, RiskMapCanvas: RiskMapCanvasStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

async function ready(wrapper: ReturnType<typeof mount>) {
  await vi.waitFor(() => expect(wrapper.find("[data-map-3d]").exists()).toBe(true));
}

function emitParents(wrapper: ReturnType<typeof mount>, codes: string[]) {
  wrapper.getComponent({ name: "RiskMap3D" }).vm.$emit("viewportParents", codes);
}

function viewportDetailCodes(wrapper: ReturnType<typeof mount>): string[] {
  const details = wrapper.getComponent({ name: "RiskMap3D" }).props("viewportDetails") as { parentCode: string }[];
  return details.map((item) => item.parentCode);
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  pending.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("risk-detail-v2")) {
      const match = /china\/(\d+)\.geojson/.exec(url);
      if (!match) throw new Error(`unexpected detail URL: ${url}`);
      const key = match[1]!;
      return new Promise<Response>((resolve) => {
        pending.push({ key, signal: init?.signal ?? undefined, resolve: (text) => resolve(response(text)) });
      });
    }
    return Promise.resolve(response(url.includes("world") ? worldText : chinaText));
  }));
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe("risk map nationwide viewport loading", () => {
  it("caps concurrent detail loads at two, deduplicates parents and exposes only loaded assets", async () => {
    const wrapper = render();
    await ready(wrapper);

    emitParents(wrapper, ["CN-31", "CN-32", "CN-33"]);
    emitParents(wrapper, ["CN-31", "CN-32", "CN-33"]);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending.map((item) => item.key)).toEqual(["310000", "320000"]);
    expect(wrapper.getComponent({ name: "RiskMap3D" }).props("baseGeo")).toBeTruthy();

    pending[0]!.resolve(detailTexts["310000"]!);
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2]!.key).toBe("330000");
    pending[1]!.resolve(detailTexts["320000"]!);
    pending[2]!.resolve(detailTexts["330000"]!);
    await vi.waitFor(() => expect(viewportDetailCodes(wrapper).sort()).toEqual(["CN-31", "CN-32", "CN-33"]));

    emitParents(wrapper, ["CN-31", "CN-32", "CN-33"]);
    await flushPromises();
    expect(pending).toHaveLength(3);
  });

  it("aborts queued detail requests and discards late results after switching map scope", async () => {
    const wrapper = render();
    await ready(wrapper);
    emitParents(wrapper, ["CN-31"]);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const signal = pending[0]!.signal;
    expect(signal?.aborted).toBe(false);

    await wrapper.findAll(".map-scope button")[1]!.trigger("click");
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    pending[0]!.resolve(detailTexts["310000"]!);
    await ready(wrapper);
    await flushPromises();
    expect(viewportDetailCodes(wrapper)).toEqual([]);
    expect(wrapper.getComponent({ name: "RiskMap3D" }).props("kind")).toBe("world");
  });

  it("aborts pending nationwide detail requests on unmount", async () => {
    const wrapper = render();
    await ready(wrapper);
    emitParents(wrapper, ["CN-31"]);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const signal = pending[0]!.signal;
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    await flushPromises();
    expect(signal?.aborted).toBe(true);
  });
});
