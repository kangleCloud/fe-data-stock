# fe-data-stock

证券数据平台的内部管理端，负责用户登录、动态菜单、权限控制以及用户和角色管理。

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

开发环境使用 `/admin/api` 作为统一 API 基址，并代理到本地 `vita-admin`：

```dotenv
VITE_API_BASE_URL=/admin/api
VITE_API_PROXY_TARGET=http://127.0.0.1:19001
```

需要本地覆盖时使用 `.env.local` 或 `.env.development.local`，不要把凭据或生产地址
写入共享环境文件。

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
- 所有请求必须通过 `src/utils/request.ts` 的 `request` 函数发送。
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

- 登录、登出和字符图片验证码
- Token 会话恢复与过期处理
- 动态菜单和动态路由
- 页面与按钮权限控制
- 用户管理
- 角色管理
- 403、404和动态组件诊断页面

股票数据中转、角色授权、菜单管理和权限分配页面将在后续迭代实现。

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
