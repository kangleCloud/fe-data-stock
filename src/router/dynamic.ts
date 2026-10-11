import type {
  RouteComponent,
  RouteRecordRaw,
} from "vue-router";

import type { BackendRoute } from "@/types/api";
import { validExternalUrl } from "@/utils/menu";

const viewModules = import.meta.glob<RouteComponent>("../views/**/*.vue");
export const menuComponentPaths = Object.keys(viewModules).map((key) => key.replace("../views/", "").replace(/\.vue$/, "")).filter((key) => !key.startsWith("error/") && !key.startsWith("login/"));
const DirectoryLayout = () => import("@/layout/DirectoryLayout.vue");
const AdminLayout = () => import("@/layout/index.vue");
const MarketLayout = () => import("@/layout/MarketLayout.vue");
const RouteLoadError = () => import("@/views/error/RouteLoadError.vue");

function resolveComponent(componentPath: string, routePath: string, depth: number): {
  component: RouteComponent;
  loadError?: string;
} {
  if (routePath === "/market" && componentPath !== "MarketLayout") {
    const loadError =
      `行情父路由必须使用 MarketLayout，当前配置为：${componentPath || "空"}`;
    console.error(loadError);
    return {
      component: RouteLoadError,
      loadError,
    };
  }
  if (componentPath === "Layout") {
    return { component: depth === 0 ? AdminLayout : DirectoryLayout };
  }
  if (componentPath === "MarketLayout") {
    return { component: MarketLayout };
  }

  const normalized = componentPath
    .replace(/^\/+/, "")
    .replace(/^views\//, "")
    .replace(/\.vue$/, "");
  const moduleKey = `../views/${normalized}.vue`;
  if (Object.hasOwn(viewModules, moduleKey)) {
    return { component: viewModules[moduleKey] as RouteComponent };
  }

  const loadError = `未找到后端路由组件：${componentPath}（解析为 ${moduleKey}）`;
  console.error(loadError);
  return {
    component: RouteLoadError,
    loadError,
  };
}

function transformRoute(route: BackendRoute, depth = 0, parentPath = ""): RouteRecordRaw {
  const rawPath = route.path || route.routeLink || "/";
  const externalUrl = route.isExternal === 1 || route.menuType === "LINK" || /^https?:/.test(rawPath) ? route.routeLink || rawPath : undefined;
  const routePath = externalUrl ? `${parentPath}/__link/${encodeURIComponent(route.routeName)}` : rawPath.startsWith("/") ? rawPath : `${parentPath}/${rawPath}`;
  const resolved = externalUrl ? { component: validExternalUrl(externalUrl) ? DirectoryLayout : RouteLoadError, loadError: validExternalUrl(externalUrl) ? undefined : "外链地址无效，仅支持 HTTP/HTTPS" } : resolveComponent(route.component, routePath, depth);
  const children = (route.children ?? []).filter((child) => child.status !== 0).map((child) => transformRoute(child, depth + 1, routePath));
  const routeRecord: RouteRecordRaw = {
    path: routePath,
    name: route.routeName,
    component: resolved.component,
    meta: {
      title: route.meta?.menuName || route.routeName,
      icon: route.meta?.icon,
      hidden: route.hidden,
      keepAlive: route.meta?.isCache === 1,
      loadError: resolved.loadError,
      directory: !resolved.loadError && (route.component === "Layout" || !!externalUrl),
      externalUrl: externalUrl && validExternalUrl(externalUrl) ? externalUrl : undefined,
      componentPath: route.component,
    },
    children,
  };

  if (children.length > 0) {
    routeRecord.redirect = firstVisiblePath(children) || children[0]?.path;
  }
  return routeRecord;
}

export function buildDynamicRoutes(routes: BackendRoute[]): RouteRecordRaw[] {
  return routes.filter((route) => route.status !== 0).map((route) => transformRoute(route));
}

export function firstVisiblePath(routes: RouteRecordRaw[]): string {
  for (const route of routes) {
    if (route.meta?.hidden || route.meta?.externalUrl) {
      continue;
    }
    if (route.children?.length) {
      const childPath = firstVisiblePath(route.children);
      if (childPath) {
        return childPath;
      }
    }
    if (
      route.path &&
      !route.meta?.directory &&
      route.component !== AdminLayout &&
      route.component !== MarketLayout
    ) {
      return route.path;
    }
  }
  return "";
}
