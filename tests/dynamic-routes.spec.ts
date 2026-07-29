import { describe, expect, it } from "vitest";

import {
  buildDynamicRoutes,
  firstVisiblePath,
} from "@/router/dynamic";
import type { BackendRoute } from "@/types/api";

describe("dynamic routes", () => {
  it("maps backend Layout and view paths", () => {
    const backendRoutes: BackendRoute[] = [
      {
        routeName: "System",
        path: "/system",
        hidden: false,
        component: "Layout",
        meta: { menuName: "系统管理", icon: "setting" },
        children: [
          {
            routeName: "SysUser",
            path: "/system/sysUser",
            hidden: false,
            component: "system/sysUser/index",
            meta: { menuName: "用户管理", icon: "user" },
          },
        ],
      },
    ];

    const routes = buildDynamicRoutes(backendRoutes);

    expect(routes[0]?.name).toBe("System");
    expect(routes[0]?.children?.[0]?.name).toBe("SysUser");
    expect(firstVisiblePath(routes)).toBe("/system/sysUser");
  });

  it("falls back to a diagnostic component for unknown views", () => {
    const [route] = buildDynamicRoutes([
      {
        routeName: "Unknown",
        path: "/unknown",
        hidden: false,
        component: "missing/index",
        meta: { menuName: "未知页面" },
      },
    ]);

    expect(route?.meta?.loadError).toContain("missing/index");
  });

  it("recognizes the immersive MarketLayout component", () => {
    const routes = buildDynamicRoutes([
      {
        routeName: "Market",
        path: "/market",
        hidden: false,
        component: "MarketLayout",
        meta: { menuName: "行情大屏" },
        children: [
          {
            routeName: "MarketOverview",
            path: "/market/overview",
            hidden: false,
            component: "market/overview/index",
            meta: { menuName: "大盘与板块总览" },
          },
        ],
      },
    ]);

    expect(routes[0]?.meta?.loadError).toBeUndefined();
    expect(firstVisiblePath(routes)).toBe("/market/overview");
  });

  it("reports an explicit diagnostic when the market root uses admin Layout", () => {
    const [route] = buildDynamicRoutes([
      {
        routeName: "Market",
        path: "/market",
        hidden: false,
        component: "Layout",
        meta: { menuName: "行情大屏" },
      },
    ]);

    expect(route?.meta?.loadError).toContain("必须使用 MarketLayout");
    expect(firstVisiblePath(route ? [route] : [])).toBe("/market");
  });
});
