import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import router from "@/router";
import MarketLayout from "@/layout/MarketLayout.vue";
import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { AUTH_EXPIRED_EVENT } from "@/utils/request";
import { saveCredential } from "@/utils/storage";
import HomeView from "@/views/entry/index.vue";

beforeEach(() => vi.stubGlobal("scrollTo", vi.fn()));

afterEach(() => {
  useAuthStore(pinia).clearSession();
  usePermissionStore(pinia).resetRoutes();
  vi.unstubAllGlobals();
});

describe("public routes", () => {
  it("opens the homepage and overview deep link without a login", async () => {
    useAuthStore(pinia).clearSession();
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/");
    const wrapper = mount(HomeView, { global: { plugins: [router] } });
    expect(wrapper.find('a[href="/market/overview"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/market/stock-monitor"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/market/etf-monitor"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("实时成交");
    wrapper.unmount();

    await router.push("/market/overview");
    expect(router.currentRoute.value.path).toBe("/market/overview");
    expect(router.currentRoute.value.meta.publicAccess).toBe(true);
    const layout = mount(MarketLayout, {
      global: { plugins: [pinia, router], stubs: { RouterView: true } },
    });
    expect(layout.find('a[href="/"]').exists()).toBe(true);
    expect(layout.find('a[href="/login"]').text()).toBe("登录管理端");
    expect(layout.find('a[href="/market/stock-monitor"]').exists()).toBe(true);
    expect(layout.find('a[href="/market/etf-monitor"]').exists()).toBe(true);
    expect(layout.find(".market-user-menu").exists()).toBe(false);
    layout.unmount();

    await router.push("/market/stock-monitor");
    expect(router.currentRoute.value.path).toBe("/market/stock-monitor");
    expect(router.currentRoute.value.meta.publicAccess).toBe(true);

    await router.push("/market/etf-monitor");
    expect(router.currentRoute.value.path).toBe("/market/etf-monitor");
    expect(router.currentRoute.value.meta.publicAccess).toBe(true);
  });

  it("keeps a visitor on the public overview when the admin session expires", async () => {
    await router.push("/market/overview");
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/market/overview");
  });

  it("shows management and user controls to a signed-in visitor", async () => {
    useAuthStore(pinia).credential = saveCredential({
      tokenName: "X-Token", tokenPrefix: "Bearer", tokenValue: "secret",
      expiresIn: 3600, userId: 1, username: "admin", nickName: "管理员",
    });
    await router.push("/market/overview");
    const layout = mount(MarketLayout, {
      global: { plugins: [pinia, router], stubs: { RouterView: true } },
    });
    expect(layout.find(".back-button").text()).toContain("管理端");
    expect(layout.find(".market-user-menu").exists()).toBe(true);
    expect(layout.find('a[href="/login"]').exists()).toBe(false);
    layout.unmount();
  });
});
