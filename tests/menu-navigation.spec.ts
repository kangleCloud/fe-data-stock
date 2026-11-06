import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, expect, it, vi } from "vitest";
import { navigateMenu } from "@/layout/menuNavigation";

afterEach(() => vi.restoreAllMocks());
it("opens the risk route with the deployment base and preserves other navigation", async () => {
  const router = createRouter({ history: createMemoryHistory("/stock/"), routes: [
    { path: "/", component: {} }, { path: "/risk/dashboard", component: {} },
    { path: "/other", component: {} }, { path: "/external", component: {}, meta: { externalUrl: "https://example.com/" } },
  ] });
  await router.push("/");
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  navigateMenu(router, "/risk/dashboard");
  expect(open).toHaveBeenCalledWith("/stock/risk/dashboard", "_blank", "noopener,noreferrer");
  expect(router.currentRoute.value.path).toBe("/");
  navigateMenu(router, "/external");
  expect(open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
  navigateMenu(router, "/other");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/other"));
});
