import type { EChartsCoreOption } from "echarts/core";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount } from "@/utils/risk";
import type { RiskMapAsset, RiskMapKind } from "@/utils/riskMap";
import type { riskMapCounts } from "@/utils/riskMap";
import type { riskFlows } from "@/utils/riskFlows";
import { riskMapGeoCenter, type RiskMapView } from "@/utils/riskMapView";

export interface RiskMapOptionInput {
  kind: RiskMapKind;
  asset: RiskMapAsset;
  counts: ReturnType<typeof riskMapCounts>;
  flows: ReturnType<typeof riskFlows>;
  view: RiskMapView;
  mode: "2d" | "3d";
  backdrop: boolean;
  reducedMotion: boolean;
  serverTarget?: RiskServerTarget;
}

interface LayerView {
  zoom: number;
  center: [number, number];
}

interface GeoLayer {
  map: string;
  silent: boolean;
  roam: false;
  layoutCenter: [string, string];
  layoutSize: string;
  z: number;
  zoom: number;
  center: [number, number];
  scaleLimit: { min: number; max: number };
  itemStyle: Record<string, string | number>;
  label: { show: false };
  emphasis: Record<string, unknown>;
}

function sourceName(kind: RiskMapKind) {
  return kind === "china" ? "中国省级" : "世界国家";
}

function layer(
  map: string,
  view: LayerView,
  layoutCenter: [string, string],
  layoutSize: number,
  z: number,
  areaColor: string,
  borderColor: string,
  silent = true,
): GeoLayer {
  return {
    map,
    silent,
    roam: false,
    layoutCenter,
    layoutSize: `${layoutSize}%`,
    z,
    zoom: view.zoom,
    center: view.center,
    scaleLimit: { min: 0.6, max: 8 },
    itemStyle: { areaColor, borderColor, borderWidth: silent ? 0.8 : 1 },
    label: { show: false },
    emphasis: { disabled: silent },
  };
}

/**
 * 单一 Canvas 内叠放多层 Geo：外层暗色轮廓制造固定视角的厚度，主层承担真实
 * 坐标、飞线与点选。3D 只是视角样式，不使用 WebGL，也不伪造三维业务数据。
 */
export function buildRiskMapOption(input: RiskMapOptionInput): EChartsCoreOption {
  const mapName = `risk-v1-${input.kind}`;
  const labels = new Map(input.asset.geo.features.map((feature) => [feature.properties.name, feature.properties.label]));
  const exact = new Map(input.counts.exact.map((item) => [item.name, item.count]));
  const [originLng, originLat] = riskMapGeoCenter(input.asset.geo);
  const view: LayerView = {
    zoom: input.view.zoom,
    center: [originLng + input.view.offset[0], originLat + input.view.offset[1]],
  };
  const world = input.kind === "world";
  const centerY = input.backdrop ? 49 : 47;
  const baseSize = input.backdrop ? (world ? 90 : 93) : (world ? 88 : 91);
  const geos: GeoLayer[] = [];

  if (input.mode === "3d") {
    geos.push(layer(mapName, view, ["50%", `${centerY}%`], baseSize + 3.2, 0, "#01101f", "#0a4057"));
    geos.push(layer(mapName, view, ["50%", `${centerY}%`], baseSize + 1.6, 1, "#031c2f", "#0d5d7c"));
  }

  const mainIndex = geos.length;
  geos.push({
    ...layer(mapName, view, ["50%", `${centerY}%`], baseSize, 2, "#0a3150", "#2ed6ef", false),
    silent: false,
    itemStyle: {
      areaColor: "#0a3150",
      borderColor: "#2ed6ef",
      borderWidth: 0.9,
      shadowColor: "#0d95b8",
      shadowBlur: input.mode === "3d" ? 16 : 8,
    },
    emphasis: {
      disabled: false,
      itemStyle: { areaColor: "#12698f" },
      label: { show: true, color: "#effdff", fontSize: 11, textBorderColor: "#03172c", textBorderWidth: 2 },
    },
  });

  const data = input.counts.safe
    ? input.counts.exact.map((item) => ({
        name: item.name,
        value: Number(item.count),
        count: item.count,
      }))
    : [];
  const hasData = data.some((item) => item.value > 0);
  const targetLabel = input.serverTarget?.alias || "服务器";

  const formatter = (params: unknown) => {
    const item = params as { name?: string; data?: { count?: string; isTarget?: boolean; same?: boolean } };
    const name = item.name ?? "";
    if (item.data?.isTarget) return `服务器：${targetLabel}\n已配置有效位置，筛选期来源汇聚终点`;
    if (item.data?.same) return `${labels.get(name) ?? name} · 与服务器同地域\n请求：${riskCount(item.data.count)}`;
    if (item.data?.count) return `${labels.get(name) ?? name} → ${targetLabel}\n请求：${riskCount(item.data.count)}`;
    return `${labels.get(name) ?? name}\n请求：${exact.has(name) ? riskCount(exact.get(name)) : "无可定位统计"}`;
  };

  const series: Record<string, unknown>[] = [
    {
      id: "risk-map-regions",
      name: "地域请求量",
      type: "map",
      map: mapName,
      geoIndex: mainIndex,
      roam: false,
      selectedMode: false,
      zlevel: 0,
      z: 3,
      animation: false,
      itemStyle: { areaColor: "#0a3150", borderColor: "#2ed6ef", borderWidth: 0.9 },
      emphasis: { label: { show: true, color: "#effdff" }, itemStyle: { areaColor: "#12698f" } },
      data,
    },
    {
      id: "risk-map-flows",
      name: "来源汇聚",
      type: "lines",
      coordinateSystem: "geo",
      geoIndex: mainIndex,
      zlevel: 1,
      z: 5,
      silent: true,
      polyline: false,
      symbol: input.reducedMotion ? ["none", "arrow"] : ["none", "none"],
      symbolSize: 7,
      effect: {
        show: !input.reducedMotion,
        period: 4.8,
        trailLength: 0.28,
        symbol: "circle",
        symbolSize: 3,
        color: "#a8fbff",
      },
      lineStyle: { curveness: 0.22, opacity: 0.9, width: 1.2 },
      data: input.flows.lines.map((line) => ({
        name: line.name,
        coords: line.coords,
        count: line.count,
        lineStyle: line.lineStyle,
      })),
    },
    {
      id: "risk-map-target",
      name: "服务器目标",
      type: "scatter",
      coordinateSystem: "geo",
      geoIndex: mainIndex,
      zlevel: 2,
      z: 6,
      symbol: "pin",
      symbolSize: 30,
      itemStyle: { color: "#ffd37d", borderColor: "#fff4d0", borderWidth: 1, shadowBlur: 18, shadowColor: "#ffc85c" },
      label: { show: false },
      emphasis: { label: { show: true, formatter: targetLabel, color: "#fff4d0", position: "top" } },
      data: input.flows.target
        ? [{ name: targetLabel, value: input.flows.target, isTarget: true }]
        : [],
    },
    {
      id: "risk-map-same",
      name: "同地域汇聚",
      type: "scatter",
      coordinateSystem: "geo",
      geoIndex: mainIndex,
      zlevel: 2,
      z: 6,
      symbol: "circle",
      symbolSize: 14,
      itemStyle: { color: "#ff8793", borderColor: "#ffdbe0", borderWidth: 1, shadowBlur: 12, shadowColor: "#ff6b7a" },
      data: input.flows.same.map((row) => ({ name: row.name, value: row.value, count: row.count, same: true })),
    },
  ];

  const precision = input.counts.safe ? (hasData ? "" : "当前筛选无带坐标的地域统计，仅显示边界。") : "计数超出安全绘图精度，地图使用中性边界，精确值见文字列表。";
  const unplaced = input.counts.unplaced.length;
  const description = `${sourceName(input.kind)}请求数地图。${precision}${unplaced ? `${unplaced} 条地域记录无本图边界，见文字列表。` : ""}${input.flows.target ? `金色标记为服务器${targetLabel}，飞线表示筛选期汇总，不是真实网络路径。` : "服务器目标无有效坐标，不绘制汇聚飞线。"}`;

  return {
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    aria: { enabled: true, label: { description } },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      confine: true,
      backgroundColor: "#041d32",
      borderColor: "#2bc5e4",
      textStyle: { color: "#e5f6ff", fontSize: 12 },
      formatter,
    },
    visualMap: input.counts.safe && hasData
      ? {
          show: !input.backdrop,
          seriesIndex: 0,
          min: 0,
          max: Math.max(1, ...data.map((item) => item.value)),
          left: 0,
          bottom: 0,
          orient: "vertical",
          text: ["请求多", "少"],
          textStyle: { color: "#b6d8ec" },
          inRange: { color: ["#124866", "#1b789b", "#25c4dc", "#8cf8ff"] },
          calculable: false,
        }
      : undefined,
    geo: geos,
    series,
  } as EChartsCoreOption;
}
