# 风控前端实施记录

2026-10-30地图增量：已随前端发布真实省级/世界GeoJSON，替换下文原阶段地图占位。当前来源、固定版本、许可、加载/隐私及验证以 `risk-map-assets.md` 为准；下文保留2026-10-27阶段记录。

2026-10-27，接入冻结契约 `risk-v1-20261027-r1`。

## 页面与接口

动态菜单组件 `risk/dashboard/index`，建议菜单路由 `/risk/dashboard`。现有 `src/router/dynamic.ts` 的受控 `import.meta.glob` 已自动注册该视图，不新增静态绕过认证的路由。回归测试执行组件加载，验证组件路径可解析。菜单与权限SQL由Java会话维护。

四个GET接口均通过统一request：`/risk/dashboard`、`/risk/interfaces/page`、`/risk/exceptions/page`、`/risk/archives/page`。由既有配置处理 `/admin/api` 前缀，统一拦截器解包 `CommonResult.content`；分页保持list/total。请求失败在页面内显示，不重复弹出轮询错误提示，也不把故障当作0或空成功。

权限在页面及每次请求入口检查：全部要求 `system:risk:view`，异常再要求 `system:risk:exception:view`，归档再要求 `system:risk:archive:view`，按AND判断。异常和归档选中后按需读取，不随汇总轮询后台拉取；失权清除相应显示，丢弃在途响应。接口明细默认显示并加载；归档查询只传日期和分页。

## 统计与交互

- 上海日期今日/昨日/近7日、自定义闭区间最多31天，拒绝非法/逆序/未来日期；地域与类型联动，筛选重置页码。
- 汇总请求结束后十秒轮询，隐藏暂停、恢复刷新、非重入；筛选/权限变化与卸载令在途结果失效。
- 失败保留历史成功画面；筛选尚未成功时明确标注旧结果。显示数据更新时间、生成时刻、采集心跳、延迟、最后事件、完整性与固定警告。
- 累计整数保留字符串，以BigInt格式化；绘图遇超出安全整数的计数不转换成不精确数值，改看精确表格。
- HTTP错误不含499；499和上游失败尝试单列。REST P95与SSE连接时长P95分别显示，标明分桶近似与overflow/无样本。SSE结束数不推导在线人数或消息量。
- 每日来源HLL明确估算，不跨日合计；UNKNOWN与INTERNAL独立。质量仅按日期，不随地域/类型掩盖失败。

深蓝页面复用BaseChart/ECharts，类型饼图、趋势与状态条形图带可访问描述和精确文本。Vue插值与richText tooltip处理外部文本，无v-html。窄屏表格独立横向滚动且可键盘聚焦，reduced-motion禁用过渡；不加载外部字体或跟踪脚本。

仓库未发现附带来源与许可的离线地理资产，显示“离线地图不可用”和真实地域排行；不伪造地图。运行页面不导入测试夹具。

## 保护基线与改动范围

执行前21个既有未提交路径的SHA256及删除状态保存在本机 `/tmp/risk-fe-baseline.json`，完成后逐项核对无变化。所有本轮文件均为新增：

- src/api/risk.ts
- src/types/risk.ts
- src/utils/risk.ts
- src/utils/riskPolling.ts
- src/composables/useRiskDashboard.ts
- src/components/risk/RiskDashboardFrame.vue
- src/views/risk/dashboard/index.vue
- src/styles/risk.css
- tests/risk-api.spec.ts
- tests/risk.spec.ts
- tests/risk-dashboard.spec.ts
- tests/risk-polling.spec.ts
- tests/fixtures/risk.ts
- tests/fixtures/risk-v1-wire.json
- docs/risk-v1-frontend.md

wire夹具为根共享fixtures中dashboardExample/sseInterfaceExample/permissionDenied的本轮冻结副本，只用于离线回归。原持仓、认证、动态路由实现、后端/Python及根共享协议未编辑。不提交、不部署。

## 验证与未实测项

规定检查：pnpm lint、pnpm type-check、pnpm test、pnpm build、git diff --check；49个测试文件375项通过，其中风控4个测试文件20项。构建保留既有BaseChart约630kB的chunk提示，不影响成功。

风控回归覆盖统一content解包/GET路径/分页/归档筛选、失败响应、上海日期与范围、长计数、AND权限、动态组件加载、轮询生命周期、真实页面过滤与失败保留、空/未知状态、安全文本、SSE独立耗时和共享wire样例、详情翻页与失权清除。

浏览器使用临时隔离预览及Axios离线adapter，明确标注测试夹具，未连接真实服务。已目视检查1280桌面和375/768/1024 iframe实际视口布局；375底部表格可横向滚动，键盘右箭头滚动与焦点环已核对。截图 `/tmp/risk-dashboard-desktop.png` 和 `/tmp/risk-dashboard-375.png` 仅为离线测试证据。临时预览文件与服务在完成后清理。

尚未完成：1440全宽与横屏/最大字号/reduced-motion系统设置的完整视觉验收；真实登录菜单授权、Java/Redis/MySQL服务联调及生产Nginx/地域库验收。离线视觉与单元测试不替代这些联调。地图资产需后续提供可核验来源和许可。
