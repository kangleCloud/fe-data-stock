import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api/menu";
const { request } = vi.hoisted(() => ({ request: vi.fn().mockResolvedValue(true) }));
vi.mock("@/utils/request", () => ({ request }));
beforeEach(() => request.mockClear());
describe("menu and grant API contract", () => {
  it("uses GET parameters for management, detail and grant trees", async () => {
    await api.getManagementTree({ menuName: "资料", nodeType: "MENU", status: 1 }); await api.getMenuDetail("22"); await api.getMenuGrantTree("33");
    expect(request.mock.calls.map(([config]) => config)).toEqual([
      { url: "/system/sysMenu/getManagementTree", method: "GET", params: { menuName: "资料", nodeType: "MENU", status: 1 } },
      { url: "/system/sysMenu/getDetail", method: "GET", params: { id: "22" } },
      { url: "/system/sysRole/getMenuGrantTree", method: "GET", params: { roleId: "33" } },
    ]);
  });
  it("sends IDs in JSON for both deletion namespaces and separate grant lists", async () => {
    await api.deleteMenu(2); await api.deleteMenuAction(2); await api.saveMenuGrants({ roleId: 9, menuIds: [2], permissionIds: [2, 99] });
    expect(request.mock.calls.map(([config]) => config)).toEqual([
      { url: "/system/sysMenu/delete", method: "POST", data: { id: 2 } },
      { url: "/system/sysMenu/action/delete", method: "POST", data: { id: 2 } },
      { url: "/system/sysRole/saveMenuGrants", method: "POST", data: { roleId: 9, menuIds: [2], permissionIds: [2, 99] } },
    ]);
  });
});
