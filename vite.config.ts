import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const moduleName = process.env.STOCK_FRONTEND_MODULE;
  const modules = ["stock-dashboard", "admin", "risk-dashboard"];
  if (moduleName && !modules.includes(moduleName)) throw new Error(`未知前端模块: ${moduleName}`);

  return {
    base: moduleName ? `/${moduleName}/` : "/",
    build: moduleName ? { outDir: `dist/${moduleName}`, emptyOutDir: true } : undefined,
    plugins: [
      {
        name: "module-entry",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return moduleName && moduleName !== "admin"
              ? html.replace("/src/main.ts", `/src/entries/${moduleName}.ts`)
              : html;
          },
        },
      },
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ["vue", "vue-router", "pinia"],
        dts: "auto-imports.d.ts",
      }),
      Components({
        resolvers: [ElementPlusResolver()],
        dts: "components.d.ts",
      }),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/admin/api": {
          target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:19001",
          changeOrigin: true,
        },
        "/openapi/api": {
          target: env.VITE_OPENAPI_PROXY_TARGET || "http://127.0.0.1:19002",
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      css: true,
      server: { deps: { inline: ["element-plus"] } },
    },
  };
});
