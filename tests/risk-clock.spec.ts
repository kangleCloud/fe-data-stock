import { mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { nextTick } from "vue";
import RiskClock from "@/components/risk/RiskClock.vue";

it("ticks across Beijing midnight from a UTC instant and clears its timer on unmount", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T15:59:59Z"));
  const clock = mount(RiskClock);
  try {
    expect(clock.get("time").text()).toBe("2026-11-05 23:59:59");
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(clock.get("time").text()).toBe("2026-11-06 00:00:00");
    expect(clock.emitted("dayChange")).toEqual([[new Date("2026-11-05T16:00:00Z")]]);
  } finally {
    clock.unmount();
    const pending = vi.getTimerCount();
    vi.useRealTimers();
    expect(pending).toBe(0);
  }
});
