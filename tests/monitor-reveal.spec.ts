import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMonitorReveal } from "@/composables/useMonitorReveal";
import { installIntersectionObserver } from "./fixtures/intersectionObserver";

const itemsOf = (count: number) => Array.from({ length: count }, (_, index) => ({ symbol: `ITEM${index}`, value: index }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
function create(count: number) {
  const items = ref(itemsOf(count));
  const wrapper = mount({ setup: () => ({ ...useMonitorReveal(items), items }), template: '<div ref="list"><section v-for="item in visible" :key="item.symbol" :data-monitor-symbol="item.symbol">{{ item.value }}</section></div><footer v-if="items.length" ref="sentinel"><button v-if="hasMore" @click="revealMore">更多</button>{{ visible.length }}/{{ items.length }}</footer>' });
  return { items, wrapper };
}

describe("local monitor card reveal", () => {
  it.each([0, 4, 5, 8, 10])("initially slices four of %s cards without changing the list", async (count) => {
    const observers = installIntersectionObserver(); const { wrapper, items } = create(count);
    try {
      await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(Math.min(4, count));
      expect(items.value).toEqual(itemsOf(count)); expect(wrapper.find("button").exists()).toBe(count > 4);
      if (count) expect(observers[0]!.options).toMatchObject({ rootMargin: "0px 0px 240px 0px", threshold: 0 });
    } finally { wrapper.unmount(); }
  });
  it("reveals 4 to 8 to 10 once per entry, keeps nodes and clears observer on unmount", async () => {
    const observers = installIntersectionObserver(); const { wrapper, items } = create(10);
    await flushPromises(); const observer = observers[0]!; const first = wrapper.findAll("section").map((node) => node.element);
    observer.emit(true); observer.emit(true); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(8);
    expect(wrapper.findAll("section").slice(0, 4).map((node) => node.element)).toEqual(first);
    observer.emit(true); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(8);
    observer.emit(false); observer.emit(true); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(10);
    expect(wrapper.find("button").exists()).toBe(false);
    items.value = items.value.slice(0, 5); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(5);
    items.value = itemsOf(10); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(10);
    wrapper.unmount(); expect(observer.disconnect).toHaveBeenCalledTimes(1);
    const detachedTarget = document.createElement("footer");
    const detachedBounds = detachedTarget.getBoundingClientRect();
    observer.callback([{ target: detachedTarget, isIntersecting: true, boundingClientRect: detachedBounds,
      intersectionRect: detachedBounds, intersectionRatio: 1, rootBounds: null, time: 0 }], observer as unknown as IntersectionObserver);
    const fresh = create(10); try { await flushPromises(); expect(fresh.wrapper.findAll("section")).toHaveLength(4); } finally { fresh.wrapper.unmount(); }
  });
  it("continues through short cards while the sentinel stays visible after each batch", async () => {
    const observers = installIntersectionObserver(); const { wrapper } = create(10);
    try {
      await flushPromises(); const observer = observers[0]!;
      const sentinel = wrapper.get("footer").element;
      vi.spyOn(sentinel, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 120 } as DOMRect);
      observer.emit(true); observer.emit(true); expect(wrapper.findAll("section")).toHaveLength(4);
      await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(10);
      expect(wrapper.find("button").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it("keeps the allowance for changed snapshots, config growth/shrink/order, and empty lists", async () => {
    installIntersectionObserver(); const { wrapper, items } = create(5);
    try {
      await wrapper.get("button").trigger("click"); expect(wrapper.findAll("section")).toHaveLength(5);
      items.value = itemsOf(10); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(8);
      items.value = [...items.value].reverse(); await flushPromises(); expect(wrapper.findAll("section")[0]!.attributes("data-monitor-symbol")).toBe("ITEM9");
      items.value = []; await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(0);
      items.value = itemsOf(10); await flushPromises(); expect(wrapper.findAll("section")).toHaveLength(8);
    } finally { wrapper.unmount(); }
  });
  it("expands the target batch before scrolling and respects reduced motion", async () => {
    installIntersectionObserver(); const { wrapper } = create(10);
    const match = vi.fn(() => ({ matches: true })); vi.stubGlobal("matchMedia", match);
    try {
      await (wrapper.vm as unknown as { revealTarget: (index: number) => Promise<void> }).revealTarget(8);
      expect(wrapper.findAll("section")).toHaveLength(10);
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
      expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(wrapper.findAll("section")[8]!.element);
    } finally { wrapper.unmount(); }
  });
  it("offers a native keyboard button when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined); const { wrapper } = create(10);
    try { await wrapper.get("button").trigger("click"); expect(wrapper.findAll("section")).toHaveLength(8); }
    finally { wrapper.unmount(); }
  });
});
