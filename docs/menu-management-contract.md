# 菜单管理前端契约与验收

纳入 [v1.0.0 根归档](../../docs/releases/v1.0.0.md)，作为当前工作树文档基线；[前端证据与验证记录](../README.md)，不等同生产发布。

## 现状与实现范围

- 补齐 `system/sysMenu/index` 页面，在既有 Vue、Element Plus、Pinia 和统一请求层内实现。
- 分类由登录路由数据中的目录决定；不在前端写死系统、股票、ETF、市场分类，也不迁移数据。
- `CONTENTS → DIRECTORY`，`MENU/LINK → MENU`，`MENU_ACTION/API → BUTTON`。
- 原页面 `/system/...` URL、组件路径和 routeName 保留。嵌套 `Layout` 使用轻量目录容器。
- 匿名首页与三个行情大屏保留原有静态路由。

## 已冻结接口

请求均通过统一 `request` 调用，响应按现有 CommonResult 解包。

| 接口 | 方法 / 入参 | 返回 content | 操作权限 |
| --- | --- | --- | --- |
| `/system/sysMenu/getManagementTree` | GET，params `{menuName?, nodeType?, status?}` | `MenuManagementNode[]` | `system:menu:view` |
| `/system/sysMenu/getDetail` | GET，params `{id}` | 现有菜单详情（可空字段保留默认值） | `system:menu:view` |
| `/system/sysMenu/getMenuTreeList` | GET | 原有下拉树 | `system:menu:view` |
| `/system/sysMenu/add` | POST，JSON SysMenuCreateDto | 新菜单 ID | `system:menu:add` |
| `/system/sysMenu/update` | POST，JSON SysMenuUpdateDto | Boolean | `system:menu:update` |
| `/system/sysMenu/delete` | POST，JSON `{id}` | Boolean | `system:menu:delete` |
| `/system/sysMenu/action/add` | POST，JSON SysPermissionCreateDto | 新权限 ID | `system:menu:add` |
| `/system/sysMenu/action/update` | POST，JSON SysPermissionUpdateDto | Boolean | `system:menu:update` |
| `/system/sysMenu/action/delete` | POST，JSON `{id}` | Boolean | `system:menu:delete` |
| `/system/sysRole/getMenuGrantTree` | GET，params `{roleId}` | `{tree, menuIds, permissionIds}` | `system:role:grant` |
| `/system/sysRole/saveMenuGrants` | POST，JSON `{roleId, menuIds, permissionIds}` | Boolean | `system:role:grant` |

菜单管理页读取完整管理树并在本地筛选，保留匹配节点祖先。父级校验和禁止级联删除始终使用完整树，而非筛选后的子树。

### 树节点

`nodeKey` 是 `menu:{id}` 或 `permission:{id}`。`nodeType` 为 `DIRECTORY/MENU/BUTTON`，`id` 是原表真实 ID；相同数字的菜单 ID 与权限 ID 不能混用。

节点保留：`parentId/menuId/menuName/menuType/permissionName/permissionCode/permissionType/authTag/apiMethod/apiPath/routeName/routeLink/componentPath/icon/sortNo/visible/isCache/alwaysShow/isExternal/status/isSystem/remark/children`。

菜单节点权限字段可为 null；按钮节点路由与显示字段可为 null。叶节点 children 是空数组。页面显示其按钮子节点的权限摘要，不新增页面 permission 字段。

菜单请求使用现有 DTO 的 `parentId/menuName/menuType/routeName/routeLink/componentPath/icon/sortNo/visible/isCache/alwaysShow/isExternal/status/remark`；操作请求使用 `permissionName/permissionCode/permissionType/menuId/apiMethod/apiPath/authTag/sortNo/status/remark`，更新额外传 `id`。

### 授权保存

- 页面与按钮独立选择；选择按钮补齐所属页面和目录祖先。
- 勾选目录选择目录中的有效页面，不自动选择操作；取消页面取消其有效操作。
- 部分页面选择时目录呈半选。
- 原始 menuIds/permissionIds 中未出现在当前可授权树的历史 ID、独立权限原样保留。若服务端额外返回停用节点，也禁止切换且保留关联。
- 后端鉴权和非法/停用新 ID 拦截由服务端执行。

## 路由、导航与缓存

- 桌面与窄屏复用递归 SidebarItem，支持三级导航，过滤隐藏节点和空目录。
- 外链必须是有效 HTTP/HTTPS 且无 URL 凭据；导航使用 window.open + noopener/noreferrer，不将外链传给内部 router。
- 组件下拉来自 import.meta.glob 的真实页面清单；未知组件保留诊断页。
- KeepAlive 实际保留配置缓存的页面状态；路由/权限契约变化或退出登录会清理缓存，未变化的权限刷新保留缓存。
- 菜单和授权保存后刷新 `/auth/info` 与 `/auth/routers`，替换动态路由、权限和导航；当前页失权转合法入口或 403。
- 切页、恢复可见、非公开接口 403 触发刷新；合并重叠请求和路由协调，忽略注销前的迟到响应。无新增轮询/SSE。
- 内置节点禁止删除；用户/角色/菜单核心页面锁定父级、路由、组件、状态等关键配置；普通内置业务菜单可启停和移动。内置权限的 code/authTag 不可修改。

## 验证范围

自动回归覆盖 API 方法与参数、空/错误状态、权限门控、防重复保存、表单校验、过滤保留祖先、循环与层级限制、外链校验、独立与历史授权保留、权限刷新合并、撤权跳转、退出后迟到响应、普通与三级路由缓存。

真实 Java 服务联调和浏览器视觉验收未在本轮文档归档中执行。相关 SQL：用户确认已执行，非本轮独立数据库核验。本文不代表线上发布或跨端 Review 已完成。

### 授权抽屉回归补充

授权选择内部使用 Map；切换后通过 `triggerRef(selection)` 通知真实 ElTree 稳定插槽更新，避免仅修改外层 revision 时勾选界面不刷新。保留原树实例、展开状态、滚动位置和键盘焦点。

授权说明移至标题 Tips，默认收起，支持悬停、聚焦、点击与 Escape；使用 Element Plus tooltip 的 `aria-describedby` 语义。正文保留加载与错误状态，树独立滚动，底部按钮固定可见，窄屏增大点击区域。

`tests/menu-grant-drawer.spec.ts` 挂载编译后的 MenuGrantDrawer 和真实 ElTree/ElCheckbox，覆盖连续勾选、半选、按钮补齐祖先、历史关联、停用节点、系统角色、保存失败重试、展开/滚动/焦点保留及 Tips 交互。浏览器窄屏视觉和真实服务联调尚未验收。
