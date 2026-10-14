# fe-data-stock

证券数据平台的 Vue 前端，提供匿名行情首页、市场/个股/ETF 三大屏和登录后的数据与权限管理。

## v1.0.0 文档基线

本次归档记录当前工作树的文档基线，不等同生产发布，公开 V1 路径与 `schemaVersion=1` 保持不变。
参见[统一根归档](../docs/releases/v1.0.0.md)。前端实现证据、历史验证和本轮核对范围集中在本文末尾。

## 系统关系

| 项目 | 职责 |
| --- | --- |
| `fe-data-stock` | Vue 管理端、会话、菜单与交互 |
| `be-vita` | 管理端 API、鉴权和数据中转 |
| `aktools` | 证券数据源 |

前端仅调用 `be-vita`，不直接访问 `aktools`。

## 技术栈

- Vite
- Vue 3
- TypeScript
- Element Plus
- Pinia
- Vue Router
- Axios
- Vitest

运行时要求 Node.js 22 或更高版本，并使用 `package.json` 声明的 pnpm 版本。

## 快速开始

```bash
pnpm install
pnpm dev
```

默认访问地址为 `http://127.0.0.1:5173`。

开发环境的管理接口 `/admin/api` 代理到本地 `vita-admin`，公开行情接口
`/openapi/api` 代理到本地 `vita-openapi`：

```dotenv
VITE_API_BASE_URL=/admin/api
VITE_API_PROXY_TARGET=http://127.0.0.1:19001
VITE_OPENAPI_PROXY_TARGET=http://127.0.0.1:19002
```

需要本地覆盖时使用 `.env.local` 或 `.env.development.local`，不要把凭据或生产地址
写入共享环境文件。

生产 API 基址在可跟踪的 `.env.production` 中为 `/stock/admin/api` 和
`/stock/openapi/api`，具体接口不重复拼接 `/stock`。该前缀用于 API，不表示静态资源
或 Vue 页面都部署在 `/stock/` 下；路由 history 使用 Vite `BASE_URL`。

## 常用命令

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm preview
```

`pnpm build` 会先执行严格类型检查，再生成 `dist/`。

## 目录结构

```text
src/
├── api/          # 按业务域封装后端接口
├── directives/   # 权限等 Vue 指令
├── layout/       # 管理端布局
├── router/       # 静态路由、守卫和动态路由转换
├── stores/       # Pinia 会话与权限状态
├── styles/       # 全局 Tokens 与基础样式
├── types/        # 公共 API 和业务类型
├── utils/        # 请求、存储、权限和校验工具
└── views/        # 登录页、错误页和管理页面
```

## 认证与权限流程

1. `GET /captcha/captcha` 获取字符图片验证码。
2. `POST /auth/login` 完成登录并保存后端返回的 Token 名称、前缀和值。
3. 并行获取 `GET /auth/info` 和 `GET /auth/routers`。
4. 将后端组件路径转换为受控 Vue 路由，并进入首个有权页面。
5. Axios 自动附加 Token；401 清理会话并返回登录页，403展示无权限提示。
6. 菜单由动态路由控制，按钮由 `v-permission` 和后端权限码共同控制。

## 接口约定

- 业务接口只允许 GET 和 POST，不使用 PUT、DELETE、PATCH。
- 不规定业务动作必须使用 GET 或 POST，以 `be-vita` Controller 契约为准。
- JSON 接口通过 `src/utils/request.ts` 的 `request` 函数发送；SSE 使用同文件的 `requestStream`。
- 返回结构统一为 `{ code, success, msg, content }`。
- 分页内容统一为 `{ list, total }`。
- API 基址不要重复写入具体接口路径。

示例：

```ts
request<PageResponse<SysUser>>({
  url: "/system/sysUser/page",
  method: "GET",
  params,
});

request<boolean>({
  url: "/system/sysUser/delete",
  method: "POST",
  params: { id },
});
```

## 当前功能

### 行情更新契约

市场、股票与 ETF 使用 V1 全量 GET 加 SSE 连续版本补丁；资金和行情独立完成后
即可更新对应数据，不等待所有模块结束。120 秒是最小启动间隔，不保证实际完成
时间。源失败、冷却或慢轮可能使更新更晚，页面标注真实采集时间并保留有效历史数据。

公开手动刷新只重新读取快照，不发起采集。首次加载、恢复可见、手动刷新、
连接恢复，以及版本缺口或 resync 时按既有生命周期 GET 对齐，不增加固定
GET 轮询。已有快照时，一般连接错误的提示延迟 10 秒显示；该计时器不是 GET 轮询，
重连退避单独处理；401/403 停止自动重连。SSE 使用 `ready`、`patch`、`resync` 事件。
参考交易日以服务提供的交易日历结果为准，不将工作日视为交易日。

外部名称、资料和错误以 Vue 文本显示；热力图 HTML Tooltip 在输出时转义，
不改写 JSON/SSE 原文。动态页面继续只从现有 `import.meta.glob` 映射解析。

### 管理功能

- 登录、登出和字符图片验证码
- Token 会话恢复与过期处理
- 动态菜单和动态路由
- 页面与按钮权限控制
- 用户管理
- 角色管理
- 菜单管理及角色菜单/按钮授权抽屉
- 股票字典、资料与监控配置管理
- ETF 字典、资料、监控配置及独立资产配置同步
- 指数配置管理
- 403、404和动态组件诊断页面

个股与 ETF 大屏的“配置管理”分别连接 `/system/stockMonitor`、`/system/etfMonitor`，
沿用 `system:stock-monitor:view`、`system:etf-monitor:view` 门控及既有动态菜单权限。
管理端启停/排序、整体采集刷新与公开大屏“重新读取快照”是不同操作；公开 GET 不触发采集。
ETF 资产配置在资料管理页单独同步，暂无可靠 ETF 资金来源时明确显示状态，不估算资金流。

### 展示规则

- 市场页提供核心指数、全市场资金、市场宽度、行业/概念热力图与涨跌 Top 10；热力图面积为有效企业数，Tooltip 展示来源与采集时间并转义外部文本。
- 资金图按实际元金额选择显示单位，零轴上红、下绿、零值中性；固定采样说明收纳于 Tips。
- 个股/ETF 价格曲线仅绘制真实采样，超过 180 秒或遇 null 断线，不补点、不平滑。
- 股票、ETF 各最多 10 只；初始 4 张，接近底部按 4→8→10 本地追加。已展示卡片和 SSE 更新后的展开数量保留，搜索/URL 定位先展开目标再滚动。
- ETF 价格与涨跌额显示三位小数，卡片包含 12 项行情指标；资料信息及资产配置独立展示。
- 首页与登录页复用备案页脚，登录备案位于表单区域；浏览器图标引用 `public/favicon.svg`。

细节见[滚动展示](docs/monitor-scroll-reveal.md)、[资金图](docs/fund-chart-display.md)、
[ETF 指标](docs/etf-quote-metrics.md)、[菜单契约](docs/menu-management-contract.md)。

## 设计规范

页面遵循项目级 UI/UX Pro Max Skill 和
`design-system/vita-stock-admin/MASTER.md`。核心视觉变量位于
`src/styles/index.css`，新增页面应复用现有颜色、间距、圆角和响应式规则。

## 开发检查

提交变更前运行：

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

更完整的编码、接口和安全规则见 [AGENTS.md](./AGENTS.md)。

## v1.0.0 实现与验证证据

归档日期：2026-10-14。以下为当前实现的只读核对，不代表生产发布或本轮重新执行前端全套检查。

### 实现证据


| 范围 | 当前说明 | 代码证据 |
| --- | --- | --- |
| 三大屏 | 匿名市场/个股/ETF，公开 V1 与 schemaVersion=1；首次、恢复可见、重同步、手动 GET 对齐缓存，SSE ready/patch/resync，无固定 10 秒 GET | [路由](src/router/index.ts)、[SSE 生命周期](src/composables/useSnapshotSse.ts)、[市场类型](src/types/market.ts)、[ETF 类型](src/types/etf.ts) |
| 时效 | 源采集仍为 120 秒最小启动间隔，非完成保证；源失败、冷却及慢轮可能延后。前端读取服务端采集时间；10 秒计时器是已有快照下的一般错误提示延迟 | [SSE 错误提示](src/composables/useSnapshotSse.ts)、[时效判定](src/utils/marketSnapshot.ts)；跨端采集规则见根归档 |
| 市场与资金 | 行业/概念热力图面积按有效企业数，涨跌 Top 10、来源及时间 Tooltip；金额按原始元值选择单位，正红负绿零中性，采样说明 Tips | [市场页](src/views/market/overview/index.vue)、[图表配置](src/charts/marketOptions.ts)、[资金 Tips](src/components/market/FundChartTips.vue) |
| 价格与 ETF 指标 | 价格间隔超过 180000ms 或 null 断段；ETF 价格/涨跌额三位小数及 12 指标，买卖价有限且大于零，缺失显示 — | [股票断段](src/utils/stockMonitor.ts)、[ETF 解析](src/utils/etfMonitor.ts)、[ETF 页面](src/views/market/etfMonitor/index.vue)、[ETF Tips](src/components/market/EtfQuoteTips.vue) |
| 本地滚动与定位 | 股票/ETF 各 10 上限；4→8→10，240px 触发，仅展开已有快照；SSE/重同步/手动 GET 不折叠，配置缩减按实际数，增长保留额度；搜索/URL 展开后定位，观察器卸载清理 | [组合函数](src/composables/useMonitorReveal.ts)、[个股页](src/views/market/stockMonitor/index.vue)、[ETF 页](src/views/market/etfMonitor/index.vue) |
| 两个配置入口 | 大屏配置管理分别进入股票/ETF 监控管理，沿用各自 view/update/refresh 权限；管理刷新可触发采集，公开 GET 仅读快照 | [股票管理](src/views/system/stockMonitor/index.vue)、[ETF 管理](src/views/system/etfMonitor/index.vue)、[股票 API](src/api/market.ts)、[ETF API](src/api/etf.ts) |
| ETF 资产配置 | 资料管理单独按 symbol/reportPeriod 同步；行情 patch 缺资产配置时保留既有资料，资料变更通过 resync 读取全量。资金状态 NO_RELIABLE_SOURCE，不估算 | [资料管理](src/views/system/etfProfile/index.vue)、[API](src/api/etf.ts)、[解析](src/utils/etfMonitor.ts) |
| 菜单与授权 | 既有动态菜单/按钮权限，授权 Map 修改通过 triggerRef(selection) 更新真实 ElTree，保留树实例与交互状态 | [授权抽屉](src/components/MenuGrantDrawer.vue)、[菜单页](src/views/system/sysMenu/index.vue)、[权限存储](src/stores/permission.ts) |
| 入口与生产前缀 | 首页与登录复用备案页脚；生产 API 为 /stock/admin/api 与 /stock/openapi/api，路由 history 使用 BASE_URL，静态前缀由构建配置决定 | [首页](src/views/entry/index.vue)、[登录](src/views/login/index.vue)、[页脚](src/components/BeianFooter.vue)、[生产环境](.env.production)、[Vite](vite.config.ts) |

### 历史验证记录

以下保留 2026-10-13 滚动展示收尾的验证结果；本轮 2026-10-14 文档归档未重跑这些命令。

| 命令 | 历史结果与范围 |
| --- | --- |
| `pnpm lint` | 通过，前端 ESLint |
| `pnpm type-check` | 通过，严格 Vue/TypeScript 类型检查；已修复卸载测试模拟事件缺少必填字段 |
| `pnpm test` | 41 个文件、317 项通过，全量 Vitest |
| `pnpm test tests/monitor-reveal.spec.ts tests/stock-monitor-view.spec.ts tests/etf-monitor-view.spec.ts` | 3 个文件、43 项通过：数量边界、滚动追加、重复通知/短卡片、网络次数、更新稳定、搜索/URL 第 9 张、配置变更、清理与按钮入口 |
| `pnpm build` | 通过，含类型检查及生产构建；仍有部分产物超过 500kB 的体积提示 |
| `git diff --check` | 通过，滚动展示改动空白检查 |

相关回归证据：[滚动组合函数](tests/monitor-reveal.spec.ts)、[个股页面](tests/stock-monitor-view.spec.ts)、[ETF 页面](tests/etf-monitor-view.spec.ts)、[资金实际 SVG](tests/fund-chart.spec.ts)、[真实授权树](tests/menu-grant-drawer.spec.ts)。

### 本轮核对与未验证项

- 本轮仅核对代码与 Markdown 说明、相对链接/示例/代码路径及 `git diff --check`；不改业务实现、不提交、不部署、不创建 tag、不执行 SQL、不启用 Review。
- 相关 SQL：用户确认已执行，非本轮独立数据库核验。
- 浏览器视觉、窄屏滚动/定位和备案页脚由用户手动验收；本轮未执行浏览器验收。
- 真实 Java/Python 服务联调、生产代理/网络/SSE 链路及真实第三方数据源，本轮均未独立验证；自动化模拟通过不代表这些项目已验收。
