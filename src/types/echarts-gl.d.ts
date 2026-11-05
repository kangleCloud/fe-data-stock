declare module "echarts-gl/charts" {
  type Extension = Exclude<Parameters<typeof import("echarts/core").use>[0], readonly unknown[]>;
  export const Map3DChart: Extension;
  export const Lines3DChart: Extension;
  export const Scatter3DChart: Extension;
}
declare module "echarts-gl/components" {
  type Extension = Exclude<Parameters<typeof import("echarts/core").use>[0], readonly unknown[]>;
  export const Geo3DComponent: Extension;
}

/** Internal imports are pinned to echarts-gl 2.1.0 by the risk runtime. */
declare module "echarts-gl/lib/util/graphicGL.js" {
  const graphicGL: { Shader: { import(source: string): void; source(name: string): string }; createMaterial(name: string): unknown };
  export default graphicGL;
}
declare module "echarts-gl/lib/util/shader/displayShadow.glsl.js" {
  const source: string;
  export default source;
}
