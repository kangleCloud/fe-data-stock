import type { EChartsCoreOption } from "echarts/core";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount } from "@/utils/risk";
import { riskRegionDisplayName, type RiskGeo, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
import type { riskMapCounts } from "@/utils/riskMap";
import {
  riskDetailDisplayName,
  riskDetailLabelNames,
  type RiskDetailLayer,
} from "@/utils/riskMapDetail";
import type { riskFlows } from "@/utils/riskFlows";
import { riskMapGeoBounds, riskMapGeoCenter, type RiskMapBounds, type RiskMapView } from "@/utils/riskMapView";

export interface RiskMapCityLabel {
  name: string;
  label: string;
  cp: [number, number];
  area: number;
  parentCode: string;
}

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
  /** 已注册的活动地图（合并细分后）与地图名；缺省使用基础资产。 */
  geo?: RiskGeo;
  mapName?: string;
  detail?: RiskDetailLayer;
  /** 二维全国视野下已加载且通过真实像素视口筛选的城市/一级行政区标签。 */
  cityLabels?: readonly RiskMapCityLabel[];
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

function visibleBounds(geo: RiskGeo, view: RiskMapView): RiskMapBounds {
  const box = riskMapGeoBounds(geo);
  const center = riskMapGeoCenter(geo);
  const spanLng = (box.maxLng - box.minLng) / view.zoom * 1.15;
  const spanLat = (box.maxLat - box.minLat) / view.zoom * 1.15;
  return {
    minLng: center[0] + view.offset[0] - spanLng / 2,
    maxLng: center[0] + view.offset[0] + spanLng / 2,
    minLat: center[1] + view.offset[1] - spanLat / 2,
    maxLat: center[1] + view.offset[1] + spanLat / 2,
  };
}

function detailLabelMinimumZoom(kind: RiskMapKind): number {
  return kind === "china" ? 1.8 : 3.2;
}

/**
 * 单一 Canvas 内叠放多层 Geo：外层暗色轮廓制造固定视角的厚度，主层承担真实
 * 坐标、飞线与点选。选中省/国家后可用已注册的合并地图显示细分边界与统计。
 */
export function buildRiskMapOption(input: RiskMapOptionInput): EChartsCoreOption {
  const activeGeo = input.geo ?? input.asset.geo;
  const mapName = input.mapName ?? `risk-v1-${input.kind}`;
  const detail = input.detail;
  const labels = new Map(activeGeo.features.map((feature) => [feature.properties.name, feature.properties.label]));
  const detailByName = new Map(detail?.geo.features.map((feature) => [feature.properties.name, feature]) ?? []);
  const displayName = (name: string) => {
    const feature = detailByName.get(name);
    if (feature) return riskRegionDisplayName(feature.properties.name, feature.properties.label);
    return riskRegionDisplayName(name, labels.get(name));
  };
  const baseCodes = new Set(activeGeo.features.map((feature) => feature.properties.name));
  const exact = new Map<string, string>(input.counts.exact.map((item) => [item.name, item.count] as const));
  const detailExact = new Map<string, string>(detail?.counts.exact.map((item) => [item.code, item.count] as const) ?? []);
  const [originLng, originLat] = riskMapGeoCenter(activeGeo);
  const view: LayerView = {
    zoom: input.view.zoom,
    center: [originLng + input.view.offset[0], originLat + input.view.offset[1]],
  };
  const world = input.kind === "world";
  const centerY = input.backdrop ? 47 : 48;
  const baseSize = input.backdrop ? (world ? 98 : 100) : (world ? 94 : 96);
  const emphasisLabelFormatter = (params: unknown) => displayName((params as { name?: string }).name ?? "");
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
      borderWidth: 1,
      shadowColor: "#0d95b8",
      shadowBlur: input.mode === "3d" ? 18 : 12,
      shadowOffsetY: 3,
    },
    emphasis: {
      disabled: false,
      itemStyle: { areaColor: "#12698f" },
      label: {
        show: true,
        formatter: emphasisLabelFormatter,
        color: "#effdff",
        fontSize: 12,
        fontWeight: 600,
        textBorderColor: "#03172c",
        textBorderWidth: 2.5,
      },
    },
    select: {
      disabled: false,
      itemStyle: { areaColor: "#1b789b" },
      label: {
        show: true,
        formatter: emphasisLabelFormatter,
        color: "#effdff",
        fontSize: 12,
        fontWeight: 600,
        textBorderColor: "#03172c",
        textBorderWidth: 2.5,
      },
    },
  });

  const overallSafe = input.counts.safe && (!detail || detail.counts.safe);
  const showProvinceLabels = input.mode === "2d" && input.kind === "china"
    && input.view.zoom < detailLabelMinimumZoom("china");
  const cityLabels = input.mode === "2d" && input.kind === "china"
    && input.view.zoom >= detailLabelMinimumZoom("china")
    ? input.cityLabels ?? []
    : [];
  const countedBaseData = overallSafe
    ? input.counts.exact
      .filter((item) => item.name !== detail?.regionCode && baseCodes.has(item.name) && !detailByName.has(item.name))
      .map((item) => ({
        name: item.name,
        value: Number(item.count),
        count: item.count,
      }))
    : [];
  const baseData = showProvinceLabels && overallSafe
    ? activeGeo.features.flatMap((feature) => {
        const name = feature.properties.name;
        if (detailByName.has(name)) return [];
        return [countedBaseData.find((row) => row.name === name) ?? { name, value: 0 }];
      })
    : countedBaseData;

  const showDetailLabels = !!detail && input.view.zoom >= detailLabelMinimumZoom(input.kind);
  const labelGeo = detail && input.kind === "china"
    ? { ...detail.geo, features: detail.geo.features.filter((feature) => feature.properties.code !== null) }
    : detail?.geo;
  const labelNames = showDetailLabels && labelGeo
    ? riskDetailLabelNames(labelGeo, {
        minDistance: (input.kind === "china" ? 4.2 : 8) / input.view.zoom,
        bounds: visibleBounds(activeGeo, input.view),
      })
    : new Set<string>();

  const detailData = detail
    ? detail.geo.features.map((feature) => {
        const count = feature.properties.code ? detailExact.get(feature.properties.code) : undefined;
        const selected = detail.selectedName === feature.properties.name;
        const label = riskRegionDisplayName(feature.properties.name, labels.get(feature.properties.name) ?? feature.properties.label);
        return {
          name: feature.properties.name,
          value: overallSafe && count ? Number(count) : 0,
          count,
          detail: true,
          itemStyle: feature.properties.code === null
            ? { areaColor: "#0a3150", borderColor: "#2ed6ef", borderWidth: 1 }
            : selected
              ? { areaColor: "#2f8eae", borderColor: "#ffd37d", borderWidth: 1.6 }
              : undefined,
          label: {
            show: labelNames.has(feature.properties.name),
            formatter: label,
            color: "#effdff",
            fontSize: 12,
            fontWeight: 500,
            textBorderColor: "#03172c",
            textBorderWidth: 2.5,
          },
        };
      })
    : [];

  const data = [...baseData, ...detailData];
  const hasData = data.some((item) => item.value > 0);
  const targetLabel = input.serverTarget?.alias || "服务器";

  const formatter = (params: unknown) => {
    const item = params as { name?: string; data?: { count?: string; isTarget?: boolean; same?: boolean; detail?: boolean } };
    const name = item.name ?? "";
    const label = displayName(name);
    if (item.data?.isTarget) return `服务器：${targetLabel}\n已配置有效位置，筛选期来源汇聚终点`;
    if (item.data?.detail) {
      const feature = detailByName.get(name);
      const display = feature ? riskDetailDisplayName(feature) : label;
      return `${display}\n细分请求：${item.data.count ? riskCount(item.data.count) : "无可核实统计"}`;
    }
    if (item.data?.same) return `${label} · 与服务器同地域\n请求：${riskCount(item.data.count)}`;
    if (item.data?.count) return `${label} → ${targetLabel}\n请求：${riskCount(item.data.count)}`;
    return `${label}\n请求：${exact.has(name) ? riskCount(exact.get(name)) : "无可定位统计"}`;
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
      itemStyle: { areaColor: "#0a3150", borderColor: "#2ed6ef", borderWidth: 1 },
      emphasis: {
        label: { show: true, formatter: emphasisLabelFormatter, color: "#effdff", fontSize: 12, fontWeight: 600, textBorderColor: "#03172c", textBorderWidth: 2.5 },
        itemStyle: { areaColor: "#12698f" },
      },
      select: {
        label: { show: true, formatter: emphasisLabelFormatter, color: "#effdff", fontSize: 12, fontWeight: 600, textBorderColor: "#03172c", textBorderWidth: 2.5 },
        itemStyle: { areaColor: "#1b789b" },
      },
      label: {
        show: showProvinceLabels,
        formatter: (params: unknown) => {
          const name = (params as { name?: string }).name ?? "";
          return riskRegionDisplayName(name, labels.get(name));
        },
        color: "#effdff",
        fontSize: 11,
        fontWeight: 500,
        textBorderColor: "#03172c",
        textBorderWidth: 2.5,
      },
      labelLayout: { hideOverlap: true },
      data,
    },
    {
      id: "risk-map-city-labels",
      name: "视野城市标签",
      type: "scatter",
      coordinateSystem: "geo",
      geoIndex: mainIndex,
      zlevel: 2,
      z: 7,
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
        textBorderColor: "#03172c",
        textBorderWidth: 2.5,
      },
      labelLayout: { hideOverlap: true },
      data: cityLabels.map((row) => ({
        name: row.label,
        label: row.label,
        parentCode: row.parentCode,
        value: [row.cp[0], row.cp[1]],
      })),
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
      id: "risk-map-target-halo",
      name: "服务器目标光晕",
      type: "scatter",
      coordinateSystem: "geo",
      geoIndex: mainIndex,
      zlevel: 1,
      z: 5,
      silent: true,
      symbol: "circle",
      symbolSize: 64,
      itemStyle: { color: "#ffd37d", opacity: 0.16, shadowBlur: 26, shadowColor: "#ffc85c" },
      label: { show: false },
      data: input.flows.target ? [{ name: targetLabel, value: input.flows.target, isTarget: true }] : [],
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
      symbolSize: 34,
      itemStyle: { color: "#ffd37d", borderColor: "#fff4d0", borderWidth: 1, shadowBlur: 20, shadowColor: "#ffc85c" },
      label: {
        show: !!input.backdrop && !!input.flows.target,
        formatter: targetLabel,
        position: "right",
        distance: 8,
        color: "#fff4d0",
        fontSize: 12,
        fontWeight: 600,
        padding: [3, 7],
        borderRadius: 3,
        backgroundColor: "#041d32d9",
        borderColor: "#ffd37d80",
        borderWidth: 1,
      },
      labelLayout: { hideOverlap: false },
      emphasis: { label: { show: true, formatter: targetLabel, color: "#fff4d0", position: "right", distance: 8 } },
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

  const precision = overallSafe ? (hasData ? "" : "当前筛选无带坐标的地域统计，仅显示边界。") : "计数超出安全绘图精度，地图使用中性边界，精确值见文字列表。";
  const unplaced = input.counts.unplaced.length + (detail?.counts.unplaced.length ?? 0);
  const detailText = detail
    ? `已叠加${detail.regionCode}的${detail.kind === "cities" ? "城市" : "一级行政区"}边界；细分统计仅按已核实编码匹配，未匹配项只保留文字排行。`
    : "";
  const description = `${sourceName(input.kind)}请求数地图。${precision}${detailText}${cityLabels.length ? `仅在当前真实视口内显示${cityLabels.length}个已核实城市标签。` : ""}${unplaced ? `${unplaced} 条地域记录无本图边界，见文字列表。` : ""}${input.flows.target ? `金色标记为服务器${targetLabel}，飞线表示筛选期汇总，不是真实网络路径。` : "服务器目标无有效坐标，不绘制汇聚飞线。"}`;

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
    visualMap: overallSafe && hasData
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

export { detailLabelMinimumZoom, visibleBounds, detailLabelMinimumZoom as riskDetailLabelMinimumZoom };
