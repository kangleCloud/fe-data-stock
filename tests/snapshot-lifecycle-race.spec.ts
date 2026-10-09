import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSnapshotSse } from "@/composables/useSnapshotSse";
import { ApiError } from "@/utils/request";

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
  it.each([401, 403])("stops automatic attempts after GET %s and permits manual retry", async (code) => {
    get.mockRejectedValue(new ApiError("拒绝访问", code));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(wrapper.text()).toContain("拒绝访问");
      await vi.advanceTimersByTimeAsync(60000);
      expect(get).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
      await (wrapper.vm as unknown as { manualRefresh: () => Promise<void> }).manualRefresh();
      await flushPromises(); expect(get).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  });

  it.each([401, 403])("stops automatic attempts after SSE HTTP %s", async (code) => {
    get.mockResolvedValue({ stateId: "new", value: 2 });
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("denied", { status: code })));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(wrapper.text()).toContain(`HTTP ${code}`);
      await vi.advanceTimersByTimeAsync(60000);
      expect(get).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it("gives normal EOF ten seconds to recover without a read-error flash", async () => {
    get.mockResolvedValue({ stateId: "new", value: 2 });
    const fetch = vi.fn((_path: string, options: RequestInit) => Promise.resolve(stream(options.signal!)));
    fetch.mockImplementationOnce((_path, options) => Promise.resolve(stream(options.signal!, "new", true)));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(wrapper.text()).not.toContain("连接已结束");
      await vi.advanceTimersByTimeAsync(1000); await flushPromises();
      await vi.advanceTimersByTimeAsync(10000);
      expect(wrapper.text()).not.toContain("连接已结束"); expect(fetch).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  });

  it("shows sustained network errors after the grace interval", async () => {
    get.mockResolvedValue({ stateId: "new", value: 2 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("网络断开")));
    const wrapper = mount(Probe);
    try {
      await flushPromises(); await vi.advanceTimersByTimeAsync(9999);
      expect(wrapper.text()).not.toContain("网络断开");
      await vi.advanceTimersByTimeAsync(1); expect(wrapper.text()).toContain("网络断开");
    } finally { wrapper.unmount(); }
  });

  it("shows non-SSE success responses immediately even when a snapshot exists", async () => {
    get.mockResolvedValue({ stateId: "new", value: 2 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { headers: { "Content-Type": "text/html" } })));
    const wrapper = mount(Probe);
    try { await flushPromises(); expect(wrapper.text()).toContain("HTTP 200，html"); }
    finally { wrapper.unmount(); }
  });
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
