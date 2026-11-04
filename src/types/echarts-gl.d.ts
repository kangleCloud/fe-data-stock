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
