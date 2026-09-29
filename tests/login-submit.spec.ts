import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginView from "@/views/login/index.vue";

const mocks = vi.hoisted(() => ({
  getCaptcha: vi.fn(),
  authenticate: vi.fn(),
  initialize: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ getCaptcha: mocks.getCaptcha }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("@/stores/permission", () => ({
  usePermissionStore: () => ({ initialize: mocks.initialize, firstPath: "/market/overview" }),
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => ({ query: {} }),
}));

afterEach(() => vi.clearAllMocks());

describe("login submission", () => {
  it("sends one login request for overlapping form submissions", async () => {
    mocks.getCaptcha.mockResolvedValue({
      captchaImg: "image", uuid: "captcha-1", captchaType: "char", encryptData: "encrypted",
    });
    let finishLogin!: (value: unknown) => void;
    mocks.authenticate.mockImplementation(() => new Promise((resolve) => { finishLogin = resolve; }));
    mocks.initialize.mockResolvedValue(undefined);
    mocks.replace.mockResolvedValue(undefined);

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[autocomplete="username"]').setValue("admin");
    await wrapper.get('input[autocomplete="current-password"]').setValue("password123");
    await wrapper.get('input[placeholder="输入图片字符"]').setValue("ABCD");

    const form = wrapper.get("form");
    await Promise.all([form.trigger("submit"), form.trigger("submit")]);
    await flushPromises();
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(mocks.authenticate.mock.calls[0]?.[0]).toMatchObject({
      userName: "admin", captchaUuid: "captcha-1", captchaCode: "ABCD",
    });

    finishLogin({});
    await flushPromises();
    wrapper.unmount();
  });
});
