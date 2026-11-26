<script setup lang="ts">
import { Plus, Minus, Refresh, Warning } from "@element-plus/icons-vue";
import { useEventListener, usePreferredReducedMotion } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import { RISK_MAP_ZOOM_STEP, useRiskMapNavigation } from "@/composables/useRiskMapNavigation";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import { guardRiskHeatLayer, type RiskHeatLayerRenderer } from "@/utils/riskHeatLayer";
import { canRiskWebGL } from "@/utils/riskWebGL";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import { riskCount, riskRegion } from "@/utils/risk";
import {
  RISK_ACCESS_EMPTY_STYLE,
  riskAccessCamera,
  riskAccessLevelColor,
  riskAccessDetailFeatures,
  riskAccessHeatPoints,
  riskAccessTargetFlows,
  riskAccessMapFeatures,
  riskAccessSelectedFeature,
} from "@/utils/riskAccessMap";
import { createRiskMapLoader, RISK_UNNAMED_REGION, riskMapCodes, riskMapCounts, riskRegionDisplayName, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
import { selectRiskVisibleLabels, selectRiskViewportRegions } from "@/utils/riskMapProjection";
import { riskMapFeatureBounds, riskMapFeatureCenter } from "@/utils/riskMapView";
import {
  createRiskDetailLoader,
  hasHan,
  riskDetailCounts,
  riskDetailFileKey,
  riskDetailLabelMap,
  type RiskDetailGeo,
  type RiskDetailLabels,
} from "@/utils/riskMapDetail";

const props = defineProps<{
  regions: { regionCode: string; requestCount: string }[];
  mapServers?: import("@/types/riskMonitor").RiskDashboardMapServer[];
  backdrop?: boolean;
  requestedKind?: RiskMapKind;
  mode?: "2d" | "3d";
  selected?: { code: string; kind: "cities" | "subdivisions" } | null;
  detail?: GeoBreakdown;
  detailLoading?: boolean;
  detailFailed?: boolean;
  detailStale?: boolean;
}>();
const emit = defineEmits<{
  regionSelect: [code: string, view: RiskMapKind];
  viewChange: [view: RiskMapKind];
  "update:mode": [mode: "2d" | "3d"];
  modeAvailable: [available: boolean];
  statusChange: [messages: string[]];
  geometryCodes: [kind: RiskMapKind, codes: Set<string>];
  detailLabels: [value: RiskDetailLabels | undefined];
}>();

interface L7SceneLike {
  addLayer: (layer: unknown) => void;
  destroy: () => void;
  fitBounds?: (bounds: unknown, options?: unknown) => void;
  getMapService?: () => { map?: MapLibreMap };
  loaded?: boolean;
  map?: MapLibreMap;
  off?: (name: string, handler: (...args: unknown[]) => void) => void;
  on: (name: string, handler: (...args: unknown[]) => void) => void;
  render?: () => void;
  setEnableRender?: (enabled: boolean) => void;
  setZoomAndCenter?: (zoom: number, center: [number, number]) => void;
  setCenter?: (center: [number, number]) => void;
  setZoom?: (zoom: number) => void;
}
interface L7LayerLike {
  animate?: (options: unknown) => unknown;
  stopAnimate?: () => void;
  color: (value: string, scale?: readonly string[] | ((value: number) => string)) => L7LayerLike;
  hide: () => L7LayerLike;
  init: () => Promise<void>;
  on: (name: string, handler: (event: unknown) => void) => L7LayerLike;
  setData: (data: unknown, options?: unknown) => L7LayerLike;
  shape: (value: string, shape?: string) => L7LayerLike;
  show: () => L7LayerLike;
  size: (value: number | string) => L7LayerLike;
  source: (data: unknown, options?: unknown) => L7LayerLike;
  style: (value: Record<string, unknown>) => L7LayerLike;
}
interface L7Packages {
  HeatmapLayer: new (options?: Record<string, unknown>) => L7LayerLike & RiskHeatLayerRenderer;
  LineLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  MapLibre: new (options: Record<string, unknown>) => unknown;
  PointLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  PolygonLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  Scene: new (options: Record<string, unknown>) => L7SceneLike;
}

const webglSupported = ref(canRiskWebGL());
const fallback = ref(!webglSupported.value);
const fallbackReason = ref(webglSupported.value ? "" : "当前浏览器不支持 WebGL，已使用二维地图与文字排行");
const state = ref<"loading" | "ready" | "fallback" | "unavailable">(fallback.value ? "fallback" : "loading");
const kind = ref<RiskMapKind>(props.requestedKind ?? "china");
const worldBackdrop = shallowRef<RiskMapAsset>();
const chinaOutline = shallowRef<RiskMapAsset>();
const MAP_PITCH = 38;
const SIDE_DEPTH_AT_FIT = 12;
const TILT_FIT_ZOOM_OFFSET = 0.08;
const MIN_ZOOM = -2;
const layerOptions = { autoFit: false, minZoom: MIN_ZOOM };
const flowSource = { parser: { type: "json", x: "lng1", y: "lat1", x1: "lng2", y1: "lat2" } };
const FLOW_THETA = 0.35;
const FLOW_PULSE = { duration: 3.6, interval: 1, trailLength: 0.028 };
const depthFailure = ref("");
const is3D = computed(() => !fallback.value && !depthFailure.value && props.mode === "3d");
const loaded = shallowRef<RiskMapAsset>();
const detailGeo = shallowRef<RiskDetailGeo>();
const detailState = ref<"idle" | "loading" | "ready" | "missing" | "failed">("idle");
const mapHost = ref<HTMLElement>();
const mapOverlay = ref<HTMLElement>();
const reducedMotion = usePreferredReducedMotion();
const motionReduced = computed(() => reducedMotion.value === "reduce");

let loader = createRiskMapLoader({ externalFallback: false });
let detailLoader = createRiskDetailLoader();
let scene: L7SceneLike | undefined;
let packages: L7Packages | undefined;
let backdropLayer: L7LayerLike | undefined;
let outlineLayer: L7LayerLike | undefined;
const targetLabels = shallowRef<{ key: string; name: string; x: number; y: number }[]>([]);
let labelMap: MapLibreMap | undefined;
let fitZoom: number | undefined;
const geographyLabels = shallowRef<{ name: string; label: string; x: number; y: number; city: boolean }[]>([]);
const cityAssets = new Map<string, RiskDetailGeo>();
const cityRequests = new Set<string>();
const failedCityAssets = new Set<string>();
let visibleCityParents: string[] = [];
let depthLayer: L7LayerLike | undefined;
let depthGeometry: RiskMapAsset["geo"] | undefined;
let regionLayer: L7LayerLike | undefined;
let heatLayer: L7LayerLike | undefined;
let flowLayer: L7LayerLike | undefined;
let flowPulseLayer: L7LayerLike | undefined;
let flowPulseKey = "";
let flowOriginLayer: L7LayerLike | undefined;
let targetLayer: L7LayerLike | undefined;
let selectedLayer: L7LayerLike | undefined;
let detailLayer: L7LayerLike | undefined;
let boundaryGlow: L7LayerLike | undefined;
let boundaryLayer: L7LayerLike | undefined;
let resizeObserver: ResizeObserver | undefined;
let contextCanvases: HTMLCanvasElement[] = [];
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let initializing: Promise<void> | undefined;
let revision = 0;
let detailRevision = 0;
let disposed = false;

const selectedParent = computed(() => {
  const selected = props.selected;
  if (!selected) return undefined;
  if (selected.kind === "cities" && kind.value !== "china") return undefined;
  if (selected.kind === "subdivisions" && kind.value !== "world") return undefined;
  return selected;
});
const geographyCandidates = computed(() => (loaded.value?.geo.features ?? []).flatMap(feature => {
  const { code, name, label } = feature.properties;
  const display = riskRegionDisplayName(name, label);
  if (!code || display === RISK_UNNAMED_REGION) return [];
  const bounds = riskMapFeatureBounds(feature);
  const center = riskMapFeatureCenter(feature);
  return [{
    name: code, code, label: display, cp: center, center,
    area: (bounds.maxLng - bounds.minLng) * (bounds.maxLat - bounds.minLat),
    probes: [
      [bounds.minLng, bounds.minLat], [bounds.minLng, bounds.maxLat],
      [bounds.maxLng, bounds.minLat], [bounds.maxLng, bounds.maxLat],
    ] as [number, number][],
  }];
}));
const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const mapFeatures = computed(() => loaded.value ? riskAccessMapFeatures(kind.value, loaded.value.geo, props.regions) : undefined);
const heatPoints = computed(() => loaded.value ? riskAccessHeatPoints(kind.value, loaded.value.geo, props.regions) : []);
const flows = computed(() => {
  if (!loaded.value) return undefined;
  return riskAccessTargetFlows(kind.value, loaded.value.geo, props.mapServers ?? [], heatPoints.value);
});
const heatLayerData = computed(() => heatPoints.value.map(point => ({ ...point, intensity: Math.sqrt(point.value) })));
let renderedHeatData: typeof heatLayerData.value = [];
const flowOrigins = computed(() => (flows.value?.lines ?? []).map(line => ({ lng: line.lng1, lat: line.lat1 })));
const selectedFeature = computed(() => loaded.value ? riskAccessSelectedFeature(loaded.value.geo, selectedParent.value?.code) : undefined);
const detailCounts = computed(() => {
  if (!detailGeo.value || !props.detail || props.detailStale) return undefined;
  return riskDetailCounts(selectedParent.value?.kind ?? "cities", props.detail.items, detailGeo.value);
});
const detailFeatureData = computed(() => detailGeo.value && detailCounts.value
  ? riskAccessDetailFeatures(detailGeo.value, detailCounts.value)
  : undefined);
const showLegend = computed(() => !!counts.value?.safe && (counts.value.exact.some((row) => BigInt(row.count) > 0n) || !!detailFeatureData.value?.features.length));

function setFallback(reason: string) {
  if (disposed) return;
  fallbackReason.value = reason;
  fallback.value = true;
  state.value = "fallback";
  destroyScene();
}

function sceneReady(target: L7SceneLike): Promise<void> {
  if (target.loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = undefined;
      target.off?.("loaded", loadedHandler);
      target.off?.("error", errorHandler);
      if (error) reject(error);
      else resolve();
    };
    const loadedHandler = () => finish();
    const errorHandler = (event: unknown) => finish(event instanceof Error ? event : new Error("MAP_SCENE_FAILED"));
    readyTimer = setTimeout(() => finish(new Error("MAP_SCENE_TIMEOUT")), 12_000);
    target.on("loaded", loadedHandler);
    target.on("error", errorHandler);
  });
}

function targetPoint() {
  return flows.value?.markers ?? [];
}

function flowData() {
  return flows.value?.lines ?? [];
}

function attachContextListener() {
  contextCanvases = Array.from(mapHost.value?.querySelectorAll("canvas") ?? []);
  for (const canvas of contextCanvases) {
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextcreationerror", onContextLost);
  }
}

function detachContextListener() {
  for (const canvas of contextCanvases) {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextcreationerror", onContextLost);
  }
  contextCanvases = [];
}

function onContextLost(event: Event) {
  event.preventDefault?.();
  setFallback("WebGL 上下文丢失，已切回二维地图与文字排行");
}

function configureFlowAnimation(initial = false) {
  if (!flowPulseLayer) return;
  const lines = flowData();
  const key = !motionReduced.value && lines.length
    ? JSON.stringify(lines.map(({ lng1, lat1, lng2, lat2 }) => [lng1, lat1, lng2, lat2]))
    : "";
  if (key === flowPulseKey) return;
  flowPulseLayer.stopAnimate?.();
  flowPulseKey = key;
  if (!key) {
    flowPulseLayer.animate?.(false);
    flowPulseLayer.hide();
    return;
  }
  flowPulseLayer.animate?.(FLOW_PULSE);
  if (!initial) flowPulseLayer.setData(lines);
  flowPulseLayer.show();
}

function buildLayers() {
  if (!packages || !scene || !mapFeatures.value) return;
  regionLayer = new packages.PolygonLayer({ ...layerOptions, blend: "normal" })
    .source(mapFeatures.value, { parser: { type: "geojson" } })
    .shape("fill")
    .color("riskLevel", riskAccessLevelColor)
    .style({ opacity: 0.83 });
  regionLayer.on("click", onRegionClick);

  const heat = new packages.HeatmapLayer({ ...layerOptions, blend: "normal" });
  guardRiskHeatLayer(heat);
  renderedHeatData = heatLayerData.value;
  heatLayer = heat
    .source(renderedHeatData, { parser: { type: "json", x: "lng", y: "lat" } })
    .shape("heatmap")
    .size("intensity")
    .style({
      intensity: 2.1,
      radius: 35,
      opacity: 0.87,
      rampColors: {
        colors: ["#075d8a", "#08b5de", "#38e5a2", "#f6ef57", "#ff7750"],
        positions: [0, 0.35, 0.62, 0.84, 1],
      },
    });

  flowLayer = new packages.LineLayer({ ...layerOptions, blend: "additive" })
    .source(flowData(), flowSource)
    .shape("arc")
    .size("width")
    .color("color")
    .style({ opacity: 0.72, thetaOffset: FLOW_THETA });

  flowPulseLayer = new packages.LineLayer({ ...layerOptions, blend: "additive", visible: false, enablePicking: false })
    .source(flowData(), flowSource)
    .shape("arc")
    .size(4.5)
    .color("#e8ffff")
    .style({ opacity: 1, thetaOffset: FLOW_THETA });
  configureFlowAnimation(true);

  flowOriginLayer = new packages.PointLayer({ ...layerOptions, blend: "additive", enablePicking: false })
    .source(flowOrigins.value, { parser: { type: "json", x: "lng", y: "lat" } })
    .shape("circle")
    .size(4)
    .color("#a5f6ff")
    .style({ opacity: 0.96, stroke: "#14dbff", strokeWidth: 2 });

  targetLayer = new packages.PointLayer(layerOptions)
    .source(targetPoint(), { parser: { type: "json", x: "lng", y: "lat" } })
    .shape("circle")
    .size(11)
    .color("#0de3ff")
    .style({ opacity: 0.96, stroke: "#c6faff", strokeWidth: 2 });

  selectedLayer = new packages.PolygonLayer({ ...layerOptions, blend: "normal" })
    .source(selectedFeature.value, { parser: { type: "geojson" } })
    .shape("fill")
    .color("#26d9ff")
    .style({ opacity: 0.18 });

  detailLayer = new packages.PolygonLayer({ ...layerOptions, blend: "normal" })
    .source(detailFeatureData.value ?? { type: "FeatureCollection", features: [] }, { parser: { type: "geojson" } })
    .shape("fill")
    .color("riskLevel", riskAccessLevelColor)
    .style({ opacity: 0.72 });

  boundaryGlow = new packages.LineLayer({ ...layerOptions, enablePicking: false })
    .source(mapFeatures.value, { parser: { type: "geojson" } })
    .shape("line")
    .size(3)
    .color("#1ecbff")
    .style({ opacity: 0.12 });

  boundaryLayer = new packages.LineLayer({ ...layerOptions, blend: "normal" })
    .source(mapFeatures.value, { parser: { type: "geojson" } })
    .shape("line")
    .size(1)
    .color("#6ae8f4")
    .style({ opacity: 0.78, strokeWidth: 0.4, stroke: "#b5ffff" });

  for (const layer of [regionLayer, heatLayer, flowLayer, flowPulseLayer, flowOriginLayer, targetLayer, selectedLayer, detailLayer, boundaryGlow, boundaryLayer]) scene.addLayer(layer);
  syncTargetLabels();
  syncBackdrop();
  syncChinaOutline();
  syncLayerVisibility();
  syncDepth();
}

function syncTargetLabels() {
  const map = labelMap;
  if (!map) return;
  targetLabels.value = targetPoint().flatMap(({ lng, lat, name }, index) => {
    const { x, y } = map.project([lng, lat]);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ key: `${lng}:${lat}:${index}`, name, x, y }] : [];
  });
}

function geographyProjector() {
  const map = labelMap;
  if (!map || !mapHost.value || !mapOverlay.value) return;
  const host = mapHost.value.getBoundingClientRect();
  const viewport = mapOverlay.value.getBoundingClientRect();
  if (!viewport.width || !viewport.height) return;
  const left = viewport.left - host.left;
  const top = viewport.top - host.top;
  return ([lng, lat]: readonly [number, number, number]) => {
    const { x, y } = map.project([lng, lat]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dx = x - left;
    const dy = y - top;
    return {
      x, y, ndcX: 2 * dx / viewport.width - 1, ndcY: 1 - 2 * dy / viewport.height,
      visible: dx > 28 && dx < viewport.width - 50 && dy > 18 && dy < viewport.height - 45,
    };
  };
}

function zoomFromFit() {
  return labelMap && fitZoom !== undefined ? 2 ** (labelMap.getZoom() - fitZoom) : 1;
}

function syncGeographyLabels() {
  const project = geographyProjector();
  const scale = zoomFromFit();
  if (!project || scale < 1.22 || !loaded.value) { geographyLabels.value = []; return; }
  const parents = selectRiskVisibleLabels(geographyCandidates.value, project, { minPixelDistance: 66, limit: 32 });
  const cities = kind.value === "china" && scale >= 1.8
    ? visibleCityParents.flatMap(code => (cityAssets.get(code)?.features ?? []).flatMap(({ properties }) =>
      properties.code && properties.nameZh && hasHan(properties.label) ? [{ ...properties, name: properties.code }] : []))
    : [];
  const parentPoints = parents.map(parent => ({ ...project([...parent.cp, 0])!, name: parent.name, label: parent.label, city: false }));
  const visibleCities = selectRiskVisibleLabels(cities, point => {
    const position = project(point);
    return position && { ...position, visible: position.visible && !parentPoints.some(parent =>
      Math.abs(parent.x - position.x) < 54 && Math.abs(parent.y - position.y) < 22) };
  }, { minPixelDistance: 48, limit: 36 });
  geographyLabels.value = [
    ...parentPoints,
    ...visibleCities.map(city => ({ ...project([...city.cp, 0])!, name: city.name, label: city.label, city: true })),
  ];
}

function loadVisibleCityAssets() {
  const project = geographyProjector();
  visibleCityParents = kind.value === "china" && zoomFromFit() >= 1.8 && project
    ? selectRiskViewportRegions(geographyCandidates.value.filter(region => riskDetailFileKey("china", region.code)), project, { limit: 6 })
    : [];
  syncGeographyLabels();
  drainCityAssets();
}

function drainCityAssets() {
  if (disposed || fallback.value || kind.value !== "china") return;
  const owner = detailLoader;
  for (const code of visibleCityParents) {
    if (cityRequests.size >= 2) break;
    if (cityAssets.has(code) || cityRequests.has(code) || failedCityAssets.has(code)) continue;
    cityRequests.add(code);
    void owner.load("china", code).then(asset => {
      if (owner === detailLoader && !disposed && !fallback.value) cityAssets.set(code, asset.geo);
    }).catch(() => {
      if (owner === detailLoader && !disposed) failedCityAssets.add(code);
    }).finally(() => {
      if (owner !== detailLoader || disposed) return;
      cityRequests.delete(code);
      syncGeographyLabels();
      drainCityAssets();
    });
  }
}

function syncBackdrop() {
  if (!scene || !packages || !worldBackdrop.value) return;
  if (!backdropLayer) {
    backdropLayer = new packages.PolygonLayer({ ...layerOptions, zIndex: -1, enablePicking: false })
      .source(worldBackdrop.value.geo, { parser: { type: "geojson" } })
      .shape("fill")
      .color("#124c77")
      .style({ opacity: 0.45 });
    scene.addLayer(backdropLayer);
  }
  if (kind.value === "china") backdropLayer.show();
  else backdropLayer.hide();
}

function syncChinaOutline() {
  if (!scene || !packages || !chinaOutline.value) return;
  if (!outlineLayer) {
    outlineLayer = new packages.LineLayer({ ...layerOptions, zIndex: 2, enablePicking: false })
      .source(chinaOutline.value.geo, { parser: { type: "geojson" } })
      .shape("line")
      .size(2)
      .color("#56eeff")
      .style({ opacity: 0.85 });
    scene.addLayer(outlineLayer);
  }
  if (kind.value === "china") outlineLayer.show();
  else outlineLayer.hide();
}

function syncDepth() {
  if (!is3D.value) { depthLayer?.hide(); return; }
  if (!scene || !packages || !loaded.value) return;
  const geometry = loaded.value.geo;
  if (depthLayer && geometry === depthGeometry) { depthLayer.show(); return; }
  const fitZoom = riskAccessCamera(geometry, cameraViewport()).zoom - TILT_FIT_ZOOM_OFFSET;
  // L7 2.29 projects the fixed-height attribute at 4 × 2^(zoom - 21).
  const height = SIDE_DEPTH_AT_FIT * 2 ** (21 - fitZoom) / 4;
  // In MapLibre coordinates L7 applies the raising height twice.
  const raisingHeight = -height / 2;
  const owner = scene;
  const fail = () => {
    if (owner !== scene) return;
    depthFailure.value = "立体地图图层初始化失败，已切回二维地图";
    emit("update:mode", "2d");
  };
  try {
    depthGeometry = geometry;
    if (depthLayer) {
      depthLayer.size(height).style({ raisingHeight }).setData(geometry).show();
      return;
    }
    const layer = new packages.PolygonLayer({ ...layerOptions, zIndex: -0.5, enablePicking: false })
      .source(geometry, { parser: { type: "geojson" } })
      .shape("extrude")
      .size(height)
      .color("#126ca2")
      // Keep the existing fill, borders and picking at altitude zero.
      .style({
        pickLight: true, heightfixed: true, raisingHeight,
        topsurface: false, sidesurface: true, sourceColor: "#0b4169", targetColor: "#209ac1",
      });
    const initLayer = layer.init.bind(layer);
    // L7's layer service launches init asynchronously without catching a rejection.
    layer.init = async () => {
      try { await initLayer(); }
      catch { window.setTimeout(fail, 0); }
    };
    depthLayer = layer;
    owner.addLayer(layer);
  } catch {
    window.setTimeout(fail, 0);
  }
}

function syncLayerVisibility() {
  if (!heatPoints.value.length) heatLayer?.hide();
  else heatLayer?.show();
  for (const layer of [flowLayer, flowOriginLayer]) {
    if (!flowData().length) layer?.hide();
    else layer?.show();
  }
  if (!flows.value?.points.length) targetLayer?.hide();
  else targetLayer?.show();
  if (!selectedFeature.value?.features.length) selectedLayer?.hide();
  else selectedLayer?.show();
  if (!detailFeatureData.value?.features.length) detailLayer?.hide();
  else detailLayer?.show();
  if (!mapFeatures.value?.features.length) boundaryLayer?.hide();
  else boundaryLayer?.show();
}

function syncDataLayers() {
  if (!scene || !loaded.value || !mapFeatures.value) return;
  if (!regionLayer) {
    buildLayers();
    return;
  }
  regionLayer.setData(mapFeatures.value);
  const heat = heatLayerData.value;
  if (heat.length !== renderedHeatData.length || heat.some((point, index) => {
    const previous = renderedHeatData[index]!;
    return point.lng !== previous.lng || point.lat !== previous.lat || point.intensity !== previous.intensity;
  })) {
    renderedHeatData = heat;
    heatLayer?.setData(heat);
  }
  flowLayer?.setData(flowData());
  flowOriginLayer?.setData(flowOrigins.value);
  targetLayer?.setData(targetPoint());
  syncTargetLabels();
  selectedLayer?.setData(selectedFeature.value);
  detailLayer?.setData(detailFeatureData.value ?? { type: "FeatureCollection", features: [] });
  boundaryGlow?.setData(mapFeatures.value);
  boundaryLayer?.setData(mapFeatures.value);
  configureFlowAnimation();
  syncLayerVisibility();
  syncDepth();
}

async function initScene() {
  if (initializing) {
    await initializing;
    if (!disposed && !fallback.value) {
      applyCamera();
      syncDataLayers();
    }
    return;
  }
  initializing = createScene();
  try { await initializing; } finally { initializing = undefined; }
}

async function createScene() {
  if (fallback.value || disposed || !loaded.value) return;
  if (scene && packages) {
    applyCamera();
    syncDataLayers();
    state.value = "ready";
    return;
  }
  try {
    const module = await import("@antv/l7") as unknown as L7Packages;
    if (disposed || fallback.value) return;
    await nextTick();
    if (!mapHost.value) throw new Error("MAP_HOST_MISSING");
    const camera = riskAccessCamera(loaded.value.geo, cameraViewport());
    packages = module;
    scene = new module.Scene({
      id: mapHost.value,
      logoVisible: false,
      map: new module.MapLibre({
        style: RISK_ACCESS_EMPTY_STYLE,
        center: camera.center,
        zoom: camera.zoom,
        minZoom: MIN_ZOOM,
        renderWorldCopies: false,
        maxZoom: 8,
        bearing: 0,
        pitch: is3D.value ? MAP_PITCH : 0,
        maxPitch: MAP_PITCH,
        interactive: false,
        attributionControl: false,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false,
        boxZoom: false,
      }),
    });
    await sceneReady(scene);
    if (disposed || fallback.value) return;
    attachContextListener();
    labelMap = mapInstance();
    labelMap?.on("move", syncTargetLabels);
    labelMap?.on("resize", syncTargetLabels);
    labelMap?.on("move", syncGeographyLabels);
    labelMap?.on("moveend", loadVisibleCityAssets);
    if (typeof ResizeObserver !== "undefined" && mapHost.value) {
      resizeObserver = new ResizeObserver(() => {
        scene?.getMapService?.().map?.resize?.();
        applyCamera(true);
        scene?.render?.();
      });
      resizeObserver.observe(mapHost.value);
      if (mapOverlay.value) resizeObserver.observe(mapOverlay.value);
    }
    buildLayers();
    applyCamera();
    state.value = "ready";
  } catch (error) {
    const reason = error instanceof Error && error.message === "MAP_SCENE_TIMEOUT"
      ? "底图初始化超时，已切回二维地图与文字排行"
      : "底图初始化失败，已切回二维地图与文字排行";
    setFallback(reason);
  }
}

function cameraViewport() {
  return { width: mapOverlay.value?.clientWidth ?? 0, height: Math.max(0, (mapOverlay.value?.clientHeight ?? 0) - 96) };
}

function mapInstance() { return scene?.getMapService?.().map ?? scene?.map; }

function moveCamera(scale: number, shift: [number, number], anchor?: [number, number]) {
  const map = mapInstance();
  const host = mapHost.value;
  if (state.value !== "ready" || !map || !host) return;
  const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + Math.log2(scale)));
  if (zoom !== map.getZoom()) {
    const box = host.getBoundingClientRect();
    const around = anchor ? map.unproject([anchor[0] - box.left, anchor[1] - box.top]) : map.getCenter();
    map.easeTo({ around, zoom, duration: 0 });
  }
  if (shift[0] || shift[1]) map.panBy([-shift[0], -shift[1]], { duration: 0 });
}

function resetCamera() { applyCamera(); }

const navigation = useRiskMapNavigation(mapHost, mapOverlay, moveCamera, resetCamera);

function applyCamera(preserve = false) {
  if (!scene || !loaded.value || !mapHost.value || !mapOverlay.value) return;
  const camera = riskAccessCamera(loaded.value.geo, cameraViewport());
  const host = mapHost.value.getBoundingClientRect();
  const overlay = mapOverlay.value.getBoundingClientRect();
  const padding = {
    left: Math.max(0, overlay.left - host.left),
    right: Math.max(0, host.right - overlay.right),
    top: Math.max(0, overlay.top - host.top) + 48,
    bottom: Math.max(0, host.bottom - overlay.bottom) + 48,
  };
  const map = mapInstance();
  const fitBump = kind.value === "china" && overlay.width >= 800 ? 0.18 : 0;
  const zoom = camera.zoom + fitBump;
  if (!preserve) fitZoom = zoom - (is3D.value ? TILT_FIT_ZOOM_OFFSET : 0);
  if (map?.jumpTo) map.jumpTo(preserve ? { padding } : {
    center: camera.center,
    zoom: fitZoom,
    pitch: is3D.value ? MAP_PITCH : 0,
    padding,
  });
  else if (scene.setZoomAndCenter) scene.setZoomAndCenter(zoom, camera.center);
  else {
    scene.setCenter?.(camera.center);
    scene.setZoom?.(zoom);
  }
}

function onRegionClick(event: unknown) {
  if (navigation.skipClick()) return;
  const point = (event as { originalEvent?: MouseEvent }).originalEvent;
  const viewport = mapOverlay.value?.getBoundingClientRect();
  if (point && viewport && (point.clientX < viewport.left || point.clientX > viewport.right || point.clientY < viewport.top || point.clientY > viewport.bottom)) return;
  const code = (event as { feature?: { properties?: { code?: unknown } } }).feature?.properties?.code;
  if (typeof code === "string" && code) emit("regionSelect", code, kind.value);
}

async function loadMap(next: RiskMapKind) {
  if (fallback.value) return;
  const current = ++revision;
  loaded.value = undefined;
  geographyLabels.value = [];
  visibleCityParents = [];
  state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision || fallback.value) return;
    loaded.value = asset;
    await initScene();
    if (next === "china") {
      void loader.load("worldBackdrop").then((asset) => {
        if (!disposed && !fallback.value) { worldBackdrop.value = asset; syncBackdrop(); }
      }).catch(() => undefined);
      void loader.load("chinaOutline").then((asset) => {
        if (!disposed && !fallback.value) { chinaOutline.value = asset; syncChinaOutline(); }
      }).catch(() => undefined);
    } else { syncBackdrop(); syncChinaOutline(); }
  } catch {
    if (!disposed && current === revision) state.value = "unavailable";
  }
}

async function loadDetail(selected: { code: string; kind: "cities" | "subdivisions" } | undefined) {
  const current = ++detailRevision;
  detailGeo.value = undefined;
  detailState.value = "idle";
  if (!selected || fallback.value) {
    emit("detailLabels", undefined);
    syncDataLayers();
    return;
  }
  if (!riskDetailFileKey(kind.value, selected.code)) {
    detailState.value = "missing";
    emit("detailLabels", undefined);
    syncDataLayers();
    return;
  }
  detailState.value = "loading";
  try {
    const asset = await detailLoader.load(kind.value, selected.code);
    if (disposed || current !== detailRevision || fallback.value) return;
    detailGeo.value = asset.geo;
    detailState.value = "ready";
    emit("detailLabels", { kind: selected.kind, regionCode: selected.code, labels: riskDetailLabelMap(asset.geo) });
    syncDataLayers();
  } catch {
    if (disposed || current !== detailRevision) return;
    detailState.value = "failed";
    emit("detailLabels", undefined);
    syncDataLayers();
  }
}

function selectMap(next: RiskMapKind) {
  if (next === kind.value) return;
  emit("viewChange", next);
  kind.value = next;
  detailRevision++;
  detailGeo.value = undefined;
  detailState.value = "idle";
  detailLoader.stop();
  detailLoader = createRiskDetailLoader();
  cityAssets.clear();
  cityRequests.clear();
  failedCityAssets.clear();
  emit("detailLabels", undefined);
  if (fallback.value) return;
  void loadMap(next);
}

function onFallbackViewChange(next: RiskMapKind) {
  if (next === kind.value) return;
  kind.value = next;
  emit("viewChange", next);
}

function emitGeometryCodes(view: RiskMapKind, codes: Set<string>) {
  emit("geometryCodes", view, codes);
}

function destroyScene() {
  detachContextListener();
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  if (readyTimer) clearTimeout(readyTimer);
  readyTimer = undefined;
  backdropLayer = undefined;
  outlineLayer = undefined;
  depthLayer = undefined;
  depthGeometry = undefined;
  labelMap?.off("move", syncTargetLabels);
  labelMap?.off("resize", syncTargetLabels);
  labelMap?.off("move", syncGeographyLabels);
  labelMap?.off("moveend", loadVisibleCityAssets);
  geographyLabels.value = [];
  visibleCityParents = [];
  labelMap = undefined;
  targetLabels.value = [];
  regionLayer = undefined;
  heatLayer = undefined;
  renderedHeatData = [];
  flowPulseLayer?.stopAnimate?.();
  flowPulseLayer = undefined;
  flowPulseKey = "";
  flowLayer = undefined;
  flowOriginLayer = undefined;
  targetLayer = undefined;
  selectedLayer = undefined;
  detailLayer = undefined;
  boundaryGlow = undefined;
  boundaryLayer = undefined;
  try { scene?.destroy(); } catch { /* A failed initializer may already own no resources. */ }
  scene = undefined;
  packages = undefined;
}

function onVisibilityChange() {
  if (!scene || document.visibilityState === "hidden") scene?.setEnableRender?.(false);
  else scene?.setEnableRender?.(true);
}

watch([mapFeatures, heatPoints, flows, selectedFeature, detailFeatureData], syncDataLayers, { deep: false });
watch(loaded, asset => { if (asset) emitGeometryCodes(kind.value, riskMapCodes(asset.geo)); });
watch(motionReduced, () => configureFlowAnimation());
watch(fallback, (enabled) => { if (enabled) emit("update:mode", "2d"); }, { immediate: true });
watch(() => state.value === "ready" && !fallback.value && !depthFailure.value, (available) => emit("modeAvailable", available), { immediate: true });
watch(is3D, (enabled) => {
  if (fallback.value) return;
  mapInstance()?.setPitch(enabled ? MAP_PITCH : 0);
  syncDepth();
  scene?.render?.();
});
watch(selectedParent, (value) => { void loadDetail(value ?? undefined); }, { immediate: true });
useEventListener(document, "visibilitychange", onVisibilityChange);
watch(() => props.requestedKind, (next) => { if (next) selectMap(next); });
onMounted(() => { void loadMap(kind.value); });
onBeforeUnmount(() => {
  disposed = true;
  revision++;
  detailRevision++;
  loader.stop();
  detailLoader.stop();
  destroyScene();
  loaded.value = undefined;
  detailGeo.value = undefined;
});

const statusMessages = computed(() => [
  state.value === "loading" ? "正在加载本地地图边界" : "",
  state.value === "unavailable" ? "本地地图资源不可用，统计文字仍可查看" : "",
  detailState.value === "loading" ? "正在加载细分边界" : "",
  detailState.value === "missing" ? "该地域暂无细分边界，保留上级地图与文字排行" : "",
  detailState.value === "failed" ? "细分边界读取失败，保留上级地图与文字排行" : "",
  counts.value && !counts.value.safe ? "计数超出安全绘图精度，地图使用中性边界，精确值见文字明细" : "",
  flows.value?.notice ?? "",
  fallbackReason.value || depthFailure.value,
].filter(Boolean));
watch(statusMessages, (value, previous) => {
  if (!previous || value.length !== previous.length || value.some((message, index) => message !== previous[index])) emit("statusChange", value);
}, { immediate: true });

const detailStatus = computed(() => {
  if (!selectedParent.value) return "";
  if (detailState.value === "loading") return "正在加载细分边界…";
  if (detailState.value === "missing") return "该地域暂无细分边界资源，保留上级地图与文字排行。";
  if (detailState.value === "failed") return "细分边界加载失败，保留上级地图与文字排行。";
  const unplaced = detailCounts.value?.unplaced.length ?? 0;
  return unplaced ? `${unplaced} 条细分记录无对应边界，见文字排行。` : "";
});
const accessibleLabel = computed(() => `${kind.value === "china" ? "中国省级" : "世界国家与地区"}访问请求地图。地域热度代表请求量，飞线连向配置的入口。精确数据见文字明细。`);
</script>

<template>
  <div class="risk-access-map" :class="{ 'risk-access-backdrop': backdrop, 'risk-access-fallback': fallback }">
    <div v-if="!fallback" ref="mapHost" class="risk-access-host">
      <div class="risk-access-geography-labels" aria-hidden="true">
        <span v-for="label in geographyLabels" :key="label.name" class="risk-access-geography-label" :class="{ 'is-city': label.city }" :style="{ left: `${label.x}px`, top: `${label.y}px` }">{{ label.label }}</span>
      </div>
      <div class="risk-access-server-labels" aria-hidden="true">
        <span v-for="label in targetLabels" :key="label.key" class="risk-access-server-label" :style="{ left: `${label.x}px`, top: `${label.y}px` }">{{ label.name }}</span>
      </div>
    </div>
    <div ref="mapOverlay" class="risk-access-overlay" :data-mode="is3D ? '3d' : '2d'" role="group" :aria-label="accessibleLabel">
      <p v-if="fallbackReason || depthFailure" class="risk-access-fallback-note" role="status">{{ fallbackReason || depthFailure }}</p>
      <RiskRegionMap
        v-if="fallback"
        class="risk-access-fallback-map"
        :regions="regions"
        :map-servers="mapServers"
        :backdrop="backdrop"
        :initial-kind="kind"
        :selected="selected ?? undefined"
        :detail="detail"
        :detail-loading="detailLoading"
        :detail-failed="detailFailed"
        :detail-stale="detailStale"
        fixed-view
        navigation
        :external-scope="requestedKind !== undefined"
        local-only
        @region-select="(code, view) => emit('regionSelect', code, view)"
        @view-change="onFallbackViewChange"
        @status-change="(messages) => emit('statusChange', messages)"
        @geometry-codes="emitGeometryCodes"
        @detail-labels="(value) => emit('detailLabels', value)"
      />

      <template v-else>
        <div v-if="requestedKind === undefined" class="risk-access-scope risk-controls" role="group" aria-label="地图范围">
          <button type="button" :aria-pressed="kind === 'china'" title="中国省级地图" @click="selectMap('china')">中国</button>
          <button type="button" :aria-pressed="kind === 'world'" title="世界国家地图" @click="selectMap('world')">世界</button>
        </div>
        <div v-if="state === 'ready'" class="risk-access-viewport-focus" role="group" tabindex="0" aria-label="地图操作，方向键平移，加减键缩放，0 复位" @keydown="navigation.keydown" />
        <div class="risk-access-navigation" role="group" aria-label="地图视图操作">
          <button type="button" aria-label="放大" title="放大" :disabled="state !== 'ready'" @click="moveCamera(RISK_MAP_ZOOM_STEP, [0, 0])"><Plus /></button>
          <button type="button" aria-label="缩小" title="缩小" :disabled="state !== 'ready'" @click="moveCamera(1 / RISK_MAP_ZOOM_STEP, [0, 0])"><Minus /></button>
          <button type="button" aria-label="复位视图" title="复位视图" :disabled="state !== 'ready'" @click="resetCamera"><Refresh /></button>
        </div>
        <p v-if="state === 'loading'" class="risk-access-loading" role="status">正在加载本地地图边界…</p>
        <div v-if="state === 'unavailable'" class="risk-access-unavailable" role="status">
          <strong>地图暂不可用</strong>
          <span>本地授权边界读取失败，排行与统计文字仍可查看。</span>
        </div>
        <div v-if="state === 'ready' && (showLegend || heatPoints.length || flows?.points.length)" class="risk-access-legend" aria-hidden="true">
          <span v-if="showLegend">请求热度</span>
          <template v-if="showLegend"><span>低</span><i /><span>高</span></template>
          <span v-if="heatPoints.length" class="risk-access-legend-heat">代表点热力</span>
          <span v-if="flows?.points.length" class="risk-access-legend-server">云端入口</span>
        </div>
        <div class="risk-access-help">
          <RiskInfo label="地图说明">
            <p>点击行政区查看细分。拖动平移，滚轮或双指缩放。紧凑窗口使用 Ctrl 或 ⌘ 加滚轮。</p>
            <p>热力与飞线使用地域代表点，飞线汇聚至配置入口，表示地域汇总请求。</p>
          </RiskInfo>
        </div>
        <details v-if="counts" class="risk-access-text">
          <summary>文字明细</summary>
          <div class="risk-access-text-body">
            <p v-if="!counts.exact.length" class="risk-access-empty">当前范围没有可定位到本图的请求。</p>
            <ul v-else>
              <li v-for="row in counts.exact" :key="row.name"><button type="button" class="risk-text-region" @click="emit('regionSelect', row.name, kind)">{{ riskRegion(row.name) }}</button><strong>{{ riskCount(row.count) }}</strong></li>
            </ul>
            <p v-if="!counts.safe" class="risk-access-warning"><Warning aria-hidden="true" />计数超出安全绘图精度，仅显示精确文本。</p>
            <p v-if="counts.unplaced.length" class="risk-access-warning">以下来源没有本图边界，未绘制：</p>
            <ul v-if="counts.unplaced.length">
              <li v-for="(row, index) in counts.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li>
            </ul>
            <p v-if="detailStatus" class="risk-access-warning">{{ detailStatus }}</p>
          </div>
        </details>
      </template>
    </div>
  </div>
</template>

<style scoped>
.risk-access-map { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: clip; background: #031426; }
.risk-access-overlay { position: absolute; inset: 0; pointer-events: none; min-width: 0; min-height: 0; }
.risk-access-overlay :is(button, summary, .risk-access-text, .risk-access-help, .risk-access-fallback-map) { pointer-events: auto; }
.risk-access-host { position: absolute; inset: 0; touch-action: pan-y; isolation: isolate; }
/* L7's gesture manager sets touch-action inline on the map container. */
.risk-access-host :deep(.maplibregl-map), .risk-access-host :deep(.l7-marker-container) {
  touch-action: pan-y !important;
  overflow: clip;
}
.risk-access-geography-labels, .risk-access-server-labels { position: absolute; inset: 0; z-index: 5; overflow: clip; pointer-events: none; }
.risk-access-geography-labels { z-index: 4; }
.risk-access-geography-label { position: absolute; transform: translate(-50%, -50%); color: #e4fbff; font: 600 12px/1.2 system-ui, sans-serif; white-space: nowrap; text-shadow: 0 1px 2px #021426, 0 0 4px #021426; }
.risk-access-geography-label.is-city { color: #b4e2f1; font-size: 11px; font-weight: 500; }
.risk-access-server-label { position: absolute; transform: translate(-50%, calc(-100% - 12px)); color: #d6fcff; font: 600 13px/1.25 system-ui, sans-serif; white-space: nowrap; text-shadow: 0 1px 2px #021426, 0 0 4px #021426; pointer-events: none; }
.risk-access-host :deep(canvas) { touch-action: pan-y; }
.risk-access-viewport-focus { position: absolute; inset: 0; }
.risk-access-viewport-focus:focus-visible { outline: 2px solid #8af6ff; outline-offset: -3px; }
.risk-access-navigation { position: absolute; z-index: 4; right: 12px; top: 46px; display: grid; grid-template-columns: 1fr; gap: 5px; margin: 0; }
.risk-access-navigation button { display: grid; place-items: center; padding: 4px; }
.risk-access-host :deep(.maplibregl-ctrl) { display: none !important; }
.risk-access-fallback-map { position: absolute; inset: 0; }
.risk-access-fallback-note { position: absolute; z-index: 6; top: 10px; left: 12px; max-width: min(420px, calc(100% - 80px)); margin: 0; padding: 4px 10px; border: 1px solid #7a5a24; border-radius: 3px; background: #2b210ddd; color: #ffd37d; font-size: 11px; text-align: center; }
.risk-access-scope { position: absolute; z-index: 4; top: 10px; right: 12px; display: flex; margin: 0; gap: 0; }
.risk-access-scope button { min-height: 28px; padding: 2px 12px; border-radius: 0; margin-left: -1px; }
.risk-access-scope button:first-child { border-radius: 4px 0 0 4px; }
.risk-access-scope button:last-child { border-radius: 0 4px 4px 0; }
.risk-access-fixed svg { width: 12px; height: 12px; }
.risk-access-loading { position: absolute; z-index: 4; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); color: #a8c9de; font-size: 13px; }
.risk-access-unavailable { position: absolute; z-index: 4; inset: 24% 16%; display: grid; place-content: center; gap: 6px; padding: 20px; border: 1px dashed #1e6c8b; background: #03192cbb; text-align: center; color: #a8c9de; font-size: 12px; }
.risk-access-unavailable strong { color: #e8f7ff; font-size: 14px; }
.risk-access-legend { position: absolute; z-index: 4; bottom: 8px; right: 12px; max-width: calc(100% - 24px); display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; padding: 6px 10px; border: 1px solid #1c789a80; border-radius: 4px; background: linear-gradient(90deg, #02182ecc, #042f4ccc 42%, #02182ed9); color: #a8c9de; font-size: 11px; backdrop-filter: blur(2px); }
.risk-access-legend i { display: block; width: 82px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #0b2f49, #1596a8, #56e4e0, #ffd166); }
.risk-access-legend-server::before, .risk-access-legend-heat::before { content: ""; display: inline-block; width: 14px; height: 3px; margin-right: 5px; vertical-align: middle; border-radius: 2px; background: #ffd166; box-shadow: 0 0 7px #ffd16699; }
.risk-access-legend-heat::before { background: #39d9ed; }
.risk-access-legend-server::before { width: 7px; height: 7px; border-radius: 50%; background:#39e7f2; box-shadow:0 0 7px #39e7f299; }
.risk-access-help { position: absolute; z-index: 5; right: 12px; bottom: 48px; }
.risk-access-help :deep(.access-info-button) { background: #02182ecc; border: 1px solid #1b6f8f; border-radius: 3px; }
.risk-access-help :deep(.access-info-content) { top: auto; right: 0; bottom: 100%; left: auto; }
.risk-access-text { position: absolute; z-index: 4; left: 12px; bottom: 48px; max-width: min(420px, calc(100% - 80px)); border: 1px solid #1c789a80; border-radius: 4px; background: #02182ef2; color: #dff8ff; font-size: 11px; }
.risk-access-text summary { min-height: 28px; padding: 5px 10px; color: #8feaf4; cursor: pointer; }
.risk-access-text-body { max-height: min(260px, 38vh); overflow: auto; padding: 0 10px 8px; }
.risk-access-text ul { margin: 0; padding: 0; list-style: none; }
.risk-access-text li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #14608466; }
.risk-access-text strong { font-variant-numeric: tabular-nums; }
.risk-access-warning { display: flex; align-items: flex-start; gap: 5px; margin: 6px 0; color: #ffd37d; }
.risk-access-warning svg { width: 12px; height: 12px; margin-top: 2px; flex-shrink: 0; }
.risk-access-empty, .risk-access-note { margin: 6px 0; color: #a8c9de; }
.risk-access-map :deep(.l7-logo) { display: none !important; }
@media (max-width: 760px) {
  .risk-access-legend { justify-content: flex-start; flex-wrap: wrap; }
  .risk-access-text { bottom: 84px; max-width: calc(100% - 24px); }
  .risk-access-help { bottom: 52px; }
  .risk-access-overlay :is(.risk-access-scope button, .risk-access-navigation button, .risk-access-text summary), .risk-access-overlay :deep(.access-info-button) { min-height: 44px; min-width: 44px; }
}
</style>
