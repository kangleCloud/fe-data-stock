import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import Footer from "@/components/BeianFooter.vue";
import Home from "@/views/entry/index.vue";
import Login from "@/views/login/index.vue";

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({}) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({}) }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => ({}) }));
vi.mock("@/api/auth", () => ({ getCaptcha: vi.fn().mockResolvedValue({ captchaImg: "", uuid: "" }) }));

describe("shared registration footer", () => {
  it.each([Home, Login])("shows exact secure links on each entry page", async (page) => {
    const wrapper = mount(page, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });
    await flushPromises();
    const footer = wrapper.get("footer");
    if (page === Login) {
      expect(footer.element.closest(".login-form-section")).not.toBeNull();
      expect(wrapper.find(".login-shell > footer").exists()).toBe(false);
    }
    expect(footer.findAll("a").map((link) => [link.text(), link.attributes("href")])).toEqual([
      ["苏ICP备2025189524号-1", "https://beian.miit.gov.cn/"],
      ["苏公网安备32050802012240号", "https://beian.mps.gov.cn/#/query/webSearch?code=32050802012240"],
    ]);
    for (const link of footer.findAll("a")) {
      expect(link.attributes("target")).toBe("_blank"); expect(link.attributes("rel")).toBe("noopener noreferrer");
    }
    wrapper.unmount();
  });

  it("hides only the fixed-size police icon after an image error", async () => {
    const wrapper = mount(Footer, { props: { theme: "dark" } });
    const icon = wrapper.get("img");
    expect(icon.attributes("width")).toBe("20"); expect(icon.attributes("height")).toBe("20");
    expect(icon.attributes("src")).toBe("https://wiki.kangle.cloud/static/beian.png");
    await icon.trigger("error");
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.findAll("a")).toHaveLength(2);
    expect(wrapper.text()).toContain("苏公网安备32050802012240号"); wrapper.unmount();
  });
});
