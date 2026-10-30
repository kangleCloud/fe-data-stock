import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import { riskMapAssets } from "@/utils/riskMap";
const texts = Object.fromEntries(riskMapAssets.map((asset) => [asset.kind, readFileSync(`public/${asset.localPath}`, "utf8")]));
const wrappers: ReturnType<typeof mount>[] = [];
function render() { const wrapper = mount(RiskRegionMap, { props: { regions: [{ regionCode: "CN-31", requestCount: "7" }] }, global: { stubs: { BaseChart: true } } }); wrappers.push(wrapper); return wrapper; }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, text: async () => texts[url.includes("china") ? "china" : "world"]! }))); });
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function ready(wrapper: ReturnType<typeof mount>) { await vi.waitFor(() => expect(wrapper.find("base-chart-stub").exists()).toBe(true)); }
describe("risk map component lifecycle", () => {
  it("defaults to China, renders real registered assets and caches both views across stats refreshes", async () => {
    const wrapper = render(); await ready(wrapper); expect(fetch).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("本地离线边界"); expect(wrapper.text()).toContain("7");
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe("中国");
    await wrapper.findAll("button")[1]!.trigger("click"); await ready(wrapper); expect(fetch).toHaveBeenCalledTimes(2);
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe("世界");
    await wrapper.findAll("button")[0]!.trigger("click"); await ready(wrapper); expect(fetch).toHaveBeenCalledTimes(2);
    vi.useFakeTimers();
    for (let tick = 0; tick < 3; tick++) { await vi.advanceTimersByTimeAsync(10_000); await wrapper.setProps({ regions: [{ regionCode: "CN-31", requestCount: String(tick + 9) }] }); }
    expect(fetch).toHaveBeenCalledTimes(2); expect(wrapper.text()).toContain("11");
  });
  it("renders neutral boundaries for unsafe counts, unknowns and country-without-province separately", async () => {
    const wrapper = render(); await ready(wrapper);
    await wrapper.setProps({ regions: [{ regionCode: "CN-31", requestCount: "9007199254740993" }, { regionCode: "CN", requestCount: "5" }, { regionCode: "UNKNOWN", requestCount: "2" }, { regionCode: "INTERNAL", requestCount: "3" }] });
    expect(wrapper.text()).toContain("超出安全绘图精度"); expect(wrapper.text()).toContain("9,007,199,254,740,993"); expect(wrapper.text()).toContain("中国来源缺省份"); expect(wrapper.text()).toContain("UNKNOWN"); expect(wrapper.text()).toContain("INTERNAL");
    const option = wrapper.getComponent({ name: "BaseChart" }).props("option"); expect(option.aria.label.description).toContain("无统计的地域仅显示边界"); expect(option.animation).toBe(false); expect(option.series[0].roam).toBe(false); expect(option.series[0].data).toEqual([]);
  });
  it("keeps a clear failure state after both sources fail without retrying on toggles", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline")); const wrapper = render(); await vi.waitFor(() => expect(wrapper.text()).toContain("地图暂不可用"));
    expect(fetch).toHaveBeenCalledTimes(2); await wrapper.findAll("button")[0]!.trigger("click"); await flushPromises(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("cancels map fetch and suppresses late rendering when removed by permission loss/unmount", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined)); const wrapper = render(); await flushPromises(); const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    wrapper.unmount(); await flushPromises(); expect(signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
