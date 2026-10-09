import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSnapshotSse } from "@/composables/useSnapshotSse";

interface State { stateId: string; value: number }
const get = vi.fn<() => Promise<State>>();
const Probe = { setup: () => useSnapshotSse<State>({ path: "/fake/stream", label: "test", get,
  parse: (value) => value as State, id: (state) => state.stateId, readyKey: "stateId",
  apply: (current, patch) => {
    const change = patch as State & { baseStateId: string };
    if (change.baseStateId !== current.stateId) throw new Error("gap");
    return change;
  } }), template: "<div>{{ snapshot?.stateId }} {{ snapshot?.value }} {{ loadError }}</div>" };

function stream(signal: AbortSignal, id = "new", close = false): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`event: ready\ndata: {"stateId":"${id}"}\n\n`));
    if (close) controller.close();
    else signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
  } }), { headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
  vi.useFakeTimers(); get.mockReset();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("snapshot lifecycle races", () => {
  it("serializes overlapping refresh GETs and discards the superseded old response", async () => {
    let resolveOld!: (value: State) => void;
    get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    get.mockResolvedValue({ stateId: "new", value: 2 });
    vi.stubGlobal("fetch", vi.fn((_path: string, options: RequestInit) => Promise.resolve(stream(options.signal!))));
    const wrapper = mount(Probe);
    const vm = wrapper.vm as unknown as { manualRefresh: () => Promise<void> };
    try {
      await flushPromises();
      const second = vm.manualRefresh(); const third = vm.manualRefresh();
      expect(get).toHaveBeenCalledTimes(1);
      resolveOld({ stateId: "old", value: 1 });
      await Promise.all([second, third]); await flushPromises();
      expect(get).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("new 2"); expect(wrapper.text()).not.toContain("old");
    } finally { wrapper.unmount(); }
  });

  it("does not let a late old stream erase the new connection's idle watchdog", async () => {
    get.mockResolvedValue({ stateId: "new", value: 2 });
    let resolveOld!: (response: Response) => void;
    const fetch = vi.fn((_path: string, options: RequestInit) => Promise.resolve(stream(options.signal!)));
    fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(Probe);
    try {
      await flushPromises();
      await (wrapper.vm as unknown as { manualRefresh: () => Promise<void> }).manualRefresh();
      await flushPromises(); expect(fetch).toHaveBeenCalledTimes(2);
      // 模拟已取消的旧请求仍迟到完成，旧 reader 立即结束。
      resolveOld(stream(new AbortController().signal, "old", true)); await flushPromises();
      expect(wrapper.text()).toContain("new 2");
      await vi.advanceTimersByTimeAsync(36000); await flushPromises();
      expect(get).toHaveBeenCalledTimes(3); expect(fetch).toHaveBeenCalledTimes(3);
    } finally { wrapper.unmount(); }
  });
});
