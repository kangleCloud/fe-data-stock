# 仓库指南

## 项目定位与边界

`fe-data-stock` 是证券数据平台的内部管理端。运行时技术栈固定为 Vite、Vue 3、
TypeScript、Element Plus、Pinia、Vue Router 和 Axios，不引入第二套 UI、
状态管理、路由或请求框架。

相关服务职责：

- `fe-data-stock`：管理端页面、会话、权限和交互。
- `be-vita`：管理端服务、鉴权和数据中转。
- `aktools`：证券数据源。本仓库不得直接依赖其 Python 实现。

## 项目结构

- `src/api/`：按业务域组织后端接口。
- `src/views/`：路由页面；系统页面组件路径需与后端动态路由契约一致。
- `src/layout/`：管理端布局和导航。
- `src/stores/`：Pinia 会话与动态权限状态。
- `src/router/`：静态路由、守卫和后端路由转换。
- `src/utils/request.ts`：唯一 Axios 实例和统一响应处理入口。
- `src/types/`：公共 API、认证和业务类型。
- `tests/`：Vitest 单元测试与类型契约用例。
- `design-system/`：项目视觉设计约束。

## 开发与验证命令

- `pnpm install`：安装依赖。
- `pnpm dev`：启动本地开发服务。
- `pnpm lint`：检查 JavaScript、TypeScript 和 Vue 代码。
- `pnpm type-check`：执行严格 TypeScript 检查。
- `pnpm test`：运行 Vitest 测试。
- `pnpm build`：先进行类型检查，再生成生产构建。

提交前至少执行 `pnpm lint`、`pnpm type-check`、`pnpm test` 和 `pnpm build`。

## 编码约定

- 使用 Vue Composition API 和 `<script setup lang="ts">`，保持 TypeScript
  `strict`，公共数据结构必须显式定义类型。
- 组件使用 `PascalCase`，组合函数使用 `useXxx`，普通变量和函数使用
  `camelCase`，常量使用 `UPPER_SNAKE_CASE`。
- 使用 `@/` 别名导入 `src/` 内容；业务逻辑不要堆积在模板表达式中。
- Element Plus 继续按需引入。图标使用 `@element-plus/icons-vue`，不要用文本或
  Emoji 代替功能图标。
- Pinia 只保存跨页面状态；页面筛选、抽屉和临时表单状态保留在页面组件中。
- 动态路由组件必须加入 `src/router/dynamic.ts` 的受控注册表，未知组件进入诊断页。

## 接口规则

- 前端和 `be-vita` 业务接口只允许 `GET`、`POST`，禁止
  `PUT`、`DELETE`、`PATCH`。
- 不额外限定 GET 和 POST 的业务语义；调用方法必须与后端 Controller 契约一致。
- 所有接口通过 `src/utils/request.ts` 的 `request` 函数调用。除该文件外不得直接
  导入 Axios、创建实例或绕过统一拦截器。
- GET/POST 均可按后端契约使用 `params`、`data` 或路径参数，不擅自改变字段位置。
- 响应统一按 `CommonResult<T>` 解包，分页统一使用 `PageResponse<T>`。
- 新增接口时同步补充 TypeScript 类型、API 模块和必要的请求测试。

## UI 与可访问性

- 界面修改遵循 `.codex/skills/ui-ux-pro-max/` 和
  `design-system/vita-stock-admin/MASTER.md`。
- 使用现有 CSS Tokens；不引入 Tailwind 或外部字体。
- 保证键盘焦点可见、表单标签明确、图标按钮具有可访问名称。
- 桌面端优先，窄屏必须可操作，表格允许横向滚动。
- 遵守 `prefers-reduced-motion`，避免无意义动画和大面积高饱和装饰。

## 测试与安全

- 请求层、权限判断、动态路由和表单工具修改必须补充回归测试。
- 删除、权限变更等操作需要明确确认，并处理重复提交、加载和错误状态。
- 不提交 Token、密码、私钥、生产地址或带凭据的本地环境文件。
- 仅通过受控 `localStorage` 键恢复会话，不在日志和错误提示中输出敏感信息。

## Git 约定

使用 Conventional Commits，例如 `feat: add role management`、
`fix: restrict request methods` 和 `docs: add frontend guide`。每次提交聚焦单一
目的，不覆盖工作区中与当前任务无关的变更。
