import type { EChartsCoreOption } from "echarts/core";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount } from "@/utils/risk";
import { riskRegionDisplayName, type RiskGeo, type RiskMapKind } from "@/utils/riskMap";
import type { riskMapCounts } from "@/utils/riskMap";
import { type RiskCamera3D } from "@/utils/riskCamera3d";
import {
  riskDetailDisplayName,
  type RiskDetailLayer,
} from "@/utils/riskMapDetail";
import type { riskFlows } from "@/utils/riskFlows";

export interface Risk3DCityLabel {
  name: string;
  label: string;
  cp: [number, number];
  area: number;
  parentCode: string;
}

export interface RiskMap3DOptionInput {
  kind: RiskMapKind;
  mapName: string;
  geo: RiskGeo;
  counts: ReturnType<typeof riskMapCounts>;
  flows: ReturnType<typeof riskFlows>;
  camera: RiskCamera3D;
  detail?: RiskDetailLayer;
  visibleDetailLabels?: ReadonlySet<string>;
  cityLabels?: readonly Risk3DCityLabel[];
  reducedMotion: boolean;
  serverTarget?: RiskServerTarget;
  boxWidth: number;
}

interface Risk3DDataRow {
  name: string;
  value: number;
  count?: string;
  detail?: boolean;
  itemStyle: { color: string; borderColor?: string; borderWidth?: number };
  label?: Record<string, unknown>;
}

export function risk3DViewControl(camera: RiskCamera3D, interactive = true): Record<string, unknown> {
  return {
    ...camera,
    autoRotate: false,
    minAlpha: 10,
    maxAlpha: 75,
    minBeta: -Infinity,
    maxBeta: Infinity,
    minDistance: 60,
    maxDistance: 300,
    rotateMouseButton: "left",
    panMouseButton: "right",
    damping: 0,
    rotateSensitivity: interactive ? 1 : 0,
    panSensitivity: interactive ? 1 : 0,
    zoomSensitivity: interactive ? 1 : 0,
  };
}

function lighting() {
  return { main: { intensity: 1.1, alpha: 45, beta: 30, shadow: false }, ambient: { intensity: 0.4 } };
}

/** 城市/一级行政区标签阈值；世界阈值更高但必须落在可达的相机范围内。 */
export function risk3DDetailLabelMinimumZoom(kind: RiskMapKind): number {
  return kind === "china" ? 1.8 : 2.2;
}

function colorFor(value: number, max: number, safe: boolean): string {
  const ratio = safe && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return `rgb(${Math.round(4 + 12 * ratio)},${Math.round(71 + 139 * ratio)},${Math.round(112 + 133 * ratio)})`;
}

function arc3D(coords: number[][]): number[][] {
  const start = coords[0]!;
  const end = coords[1]!;
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    return [start[0]! + (end[0]! - start[0]!) * t, start[1]! + (end[1]! - start[1]!) * t, 0.02 + Math.sin(Math.PI * t) * 0.9];
  });
}

export function buildRiskMap3DOption(input: RiskMap3DOptionInput): EChartsCoreOption {
  const { detail } = input;
  const labels = new Map(input.geo.features.map((feature) => [feature.properties.name, feature.properties.label]));
  for (const feature of detail?.geo.features ?? []) labels.set(feature.properties.name, feature.properties.label);
  const detailByName = new Map(detail?.geo.features.map((feature) => [feature.properties.name, feature]) ?? []);
  const displayName = (name: string) => {
    const feature = detailByName.get(name);
    if (feature) return riskRegionDisplayName(feature.properties.name, feature.properties.label);
    return riskRegionDisplayName(name, labels.get(name));
  };
  const emphasisFormatter = (params: unknown) => displayName((params as { name?: string }).name ?? "");
  const detailCodes = new Set(detail?.geo.features.flatMap((feature) => feature.properties.code ? [feature.properties.code] : []) ?? []);
  const detailExact = new Map<string, string>(detail?.counts.exact.map((item) => [item.code, item.count] as const) ?? []);
  const exact = new Map<string, string>(input.counts.exact.map((item) => [item.name, item.count] as const));
  const overallSafe = input.counts.safe && (!detail || detail.counts.safe);
  const baseRows = overallSafe
    ? input.counts.exact.filter((item) => item.name !== detail?.regionCode && !detailCodes.has(item.name) && !detailByName.has(item.name))
    : [];
  const max = Math.max(
    1,
    ...baseRows.map((item) => Number(item.count)),
    ...(detail?.counts.exact.map((item) => Number(item.count)) ?? []),
  );

  const baseData: Risk3DDataRow[] = baseRows.map((item) => ({
    name: item.name,
    value: Number(item.count),
    count: item.count,
    itemStyle: { color: colorFor(Number(item.count), max, overallSafe) },
  }));

  const labelNames = input.visibleDetailLabels ?? new Set<string>();

  const detailData: Risk3DDataRow[] = detail
    ? detail.geo.features.map((feature) => {
        const count = feature.properties.code ? detailExact.get(feature.properties.code) : undefined;
        const selected = detail.selectedName === feature.properties.name;
        const value = overallSafe && count ? Number(count) : 0;
        return {
          name: feature.properties.name,
          value,
          count,
          detail: true,
          itemStyle: {
            color: feature.properties.code === null ? "#064770" : selected ? "#46c9e8" : colorFor(value, max, overallSafe),
            ...(selected ? { borderColor: "#ffd37d", borderWidth: 2 } : {}),
          },
          label: {
            show: labelNames.has(feature.properties.name),
            formatter: riskRegionDisplayName(feature.properties.name, feature.properties.label),
            color: "#effdff",
            fontSize: 12,
            fontWeight: 500,
            textBorderColor: "#041d32",
            textBorderWidth: 2,
          },
        };
      })
    : [];

  const data = [...baseData, ...detailData];
  const targetLabel = input.serverTarget?.alias || "服务器";
  const formatter = (params: unknown) => {
    const item = params as { name?: string; data?: { count?: string; isTarget?: boolean; detail?: boolean } };
    const name = item.name ?? "";
    if (item.data?.isTarget) return `服务器：${targetLabel}\n已配置有效位置，筛选期来源汇聚终点`;
    if (item.data?.detail) {
      const feature = detailByName.get(name);
      return `${feature ? riskDetailDisplayName(feature) : displayName(name)}\n细分请求：${item.data.count ? riskCount(item.data.count) : "无可核实统计"}`;
    }
    const label = displayName(name);
    if (item.data?.count) return `${label} → ${targetLabel}\n请求：${riskCount(item.data.count)}`;
    return `${label}\n请求：${exact.has(name) ? riskCount(exact.get(name)) : "无可定位统计"}`;
  };
  const description = `可旋转三维${input.kind === "china" ? "中国省级" : "世界国家"}请求数地图。${overallSafe ? "" : "计数超出安全绘图精度，地图使用中性颜色，精确值见文字列表。"}${detail ? `已叠加${detail.regionCode}细分边界，统计仅按已核实编码匹配。` : ""}${input.cityLabels?.length ? `仅在当前真实视口内显示${input.cityLabels.length}个地域标签。` : ""}${input.flows.target ? "飞线表示筛选期汇总，不是真实网络路径。" : "服务器目标无有效坐标，不绘制汇聚飞线。"}`;

  return {
    animation: false,
    aria: { enabled: true, label: { description } },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      confine: true,
      backgroundColor: "#041d32",
      borderColor: "#2bc5e4",
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: "#e5f6ff", fontSize: 13, lineHeight: 20 },
      formatter,
    },
    geo3D: {
      map: input.mapName,
      show: false,
      zlevel: -3,
      boxWidth: input.boxWidth,
      boxHeight: 24,
      regionHeight: detail ? 2.6 : 2,
      environment: "none",
      itemStyle: { color: "#064770", borderColor: "#35eaff", borderWidth: 1 },
      label: { show: false },
      emphasis: { label: { show: false, formatter: emphasisFormatter }, itemStyle: { color: "#55edff" } },
      viewControl: risk3DViewControl(input.camera, false),
      postEffect: { enable: false },
      temporalSuperSampling: { enable: false },
      light: lighting(),
    },
    series: [
      {
        id: "risk3d-regions",
        name: "地域请求量",
        type: "map3D",
        map: input.mapName,
        coordinateSystem: "geo3D",
        zlevel: -2,
        boxWidth: input.boxWidth,
        boxHeight: 24,
        regionHeight: detail ? 2.6 : 2,
        viewControl: risk3DViewControl(input.camera),
        shading: "lambert",
        postEffect: { enable: false },
        temporalSuperSampling: { enable: false },
        light: lighting(),
        label: { show: false },
        itemStyle: { color: "#064770", borderColor: "#35eaff", borderWidth: 1 },
        emphasis: {
          label: {
            show: true,
            formatter: emphasisFormatter,
            color: "#effdff",
            fontSize: 12,
            fontWeight: 600,
            textBorderColor: "#041d32",
            textBorderWidth: 2,
          },
          itemStyle: { color: "#55edff" },
        },
        data,
      },
      {
        id: "risk3d-city-labels",
        type: "scatter3D",
        coordinateSystem: "geo3D",
        zlevel: -1,
        silent: true,
        symbol: "circle",
        symbolSize: 3,
        itemStyle: { color: "#8ff7ff", opacity: 0.75 },
        label: {
          show: true,
          position: "right",
          distance: 4,
          formatter: (params: unknown) => (params as { data?: { label?: string } }).data?.label ?? "",
          color: "#effdff",
          fontSize: 12,
          fontWeight: 500,
          textBorderColor: "#041d32",
          textBorderWidth: 2,
        },
        data: (input.cityLabels ?? []).map((row) => ({
          name: row.label,
          label: row.label,
          parentCode: row.parentCode,
          value: [row.cp[0], row.cp[1], 0.02],
        })),
      },
      {
        id: "risk3d-flows",
        type: "lines3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        silent: true,
        polyline: true,
        effect: { show: false },
        data: input.flows.lines.map((line) => ({
          name: line.name,
          coords: arc3D(line.coords),
          count: line.count,
          lineStyle: line.lineStyle,
        })),
      },
      {
        id: "risk3d-sources",
        type: "scatter3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        silent: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: "#57f5ff" },
        data: input.flows.lines.map((line) => ({ name: line.name, value: [...line.coords[0]!, 0.02] })),
      },
      {
        id: "risk3d-source-halos",
        type: "scatter3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        silent: true,
        symbolSize: 16,
        itemStyle: { color: "#40edff", opacity: 0.16 },
        data: input.flows.lines.map((line) => ({ value: [...line.coords[0]!, 0.02] })),
      },
      {
        id: "risk3d-target-halo",
        type: "scatter3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        silent: true,
        symbolSize: 34,
        itemStyle: { color: "#ffd18c", opacity: 0.2 },
        data: input.flows.target ? [{ value: [...input.flows.target, 0.02] }] : [],
      },
      {
        id: "risk3d-target",
        type: "scatter3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        symbol: "circle",
        symbolSize: 16,
        itemStyle: { color: "#ffd18c" },
        data: input.flows.target ? [{ name: targetLabel, isTarget: true, value: [...input.flows.target, 0.02] }] : [],
      },
      {
        id: "risk3d-height-range",
        type: "scatter3D",
        zlevel: -1,
        coordinateSystem: "geo3D",
        silent: true,
        symbolSize: 0,
        itemStyle: { opacity: 0 },
        data: input.flows.target ? [[...input.flows.target, 0], [...input.flows.target, 1]] : [],
      },
    ],
  } as EChartsCoreOption;
}
