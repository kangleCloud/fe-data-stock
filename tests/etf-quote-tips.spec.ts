import { flushPromises, mount } from "@vue/test-utils";
import ElementPlus, { ElPopover } from "element-plus";
import { expect, it, vi } from "vitest";
import EtfQuoteTips from "@/components/market/EtfQuoteTips.vue";

it("keeps ETF quote rules collapsed and opens a real tooltip with keyboard focus or click", async () => {
  const wrapper = mount(EtfQuoteTips, { attachTo: document.body, global: { plugins: [ElementPlus] } });
  try {
    await flushPromises();
    const button = wrapper.get("button");
    expect(button.attributes("aria-describedby")).toBeUndefined();
    (button.element as HTMLButtonElement).focus(); await flushPromises();
    await vi.waitFor(() => expect(button.attributes("aria-describedby")).toBeTruthy());
    const description = button.attributes("aria-describedby");
    const tooltip = document.getElementById(description!)!;
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    expect(tooltip.textContent).toContain("原始采样不四舍五入"); expect(tooltip.textContent).toContain("实际采集时间");
    expect(wrapper.findComponent(ElPopover).exists()).toBe(true);
    await button.trigger("keydown", { key: "Escape", code: "Escape" }); await flushPromises();
    await vi.waitFor(() => expect(button.attributes("aria-describedby")).toBeUndefined());
    await button.trigger("click", { button: 0 }); await flushPromises();
    await vi.waitFor(() => expect(button.attributes("aria-describedby")).toBeTruthy());
  } finally { wrapper.unmount(); }
});
