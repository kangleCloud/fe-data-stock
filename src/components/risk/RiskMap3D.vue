<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { EChartsType, EChartsCoreOption } from "echarts/core";
import type { RiskMapAsset, RiskMapKind } from "@/utils/riskMap";
import { riskMapCounts } from "@/utils/riskMap";
import { riskFlows } from "@/utils/riskFlows";
import { defaultRiskCamera, normalizeRiskCamera, riskCameraKey, riskArc3D, type RiskCamera3D } from "@/utils/riskCamera3d";
import { riskCount } from "@/utils/risk";
import type { RiskServerTarget } from "@/types/riskServer";
const props = defineProps<{ asset: RiskMapAsset; kind: RiskMapKind; regions: { regionCode: string; requestCount: string }[]; serverTarget?: RiskServerTarget; camera: RiskCamera3D; height: string }>();
const emit = defineEmits<{ regionSelect: [code: string]; cameraChange: [value: RiskCamera3D]; failed: [reason: string] }>();
const root = ref<HTMLElement>();
let chart: EChartsType | undefined; let observer: ResizeObserver | undefined; let disposed = false; let lost = false;
let camera = normalizeRiskCamera(props.camera);
const cameraSnapshot = ref(camera); let down: number[] | undefined; let dragged = false;
let pickAfter = 0;
const frameAspect = ref(2);
const boxWidth = computed(() => (props.kind === "world" ? 165 : 200) * Math.min(1, frameAspect.value / 1.5));
function fitFrame() { const element = root.value; if (!element?.clientWidth || !element.clientHeight) return false; const next = element.clientWidth / element.clientHeight; if (Math.abs(next - frameAspect.value) < .01) return false; frameAspect.value = next; return true; }
const counts = computed(() => riskMapCounts(props.kind, props.regions, props.asset.geo));
const flows = computed(() => riskFlows(props.kind, props.regions, props.serverTarget, props.asset.geo));
function fail(reason: string) { if (disposed || lost) return; lost = true; cleanupChart(); emit("failed", reason); }
function cleanupChart() {
  observer?.disconnect(); observer = undefined;
  const renderer = chart; chart = undefined;
  try { renderer?.dispose(); } catch { /* Lost contexts must still allow the host to fall back. */ }
}
function pointerDown(e: PointerEvent) { down = [e.clientX, e.clientY]; dragged = false; }
function pointerMove(e: PointerEvent) { if (down && Math.hypot(e.clientX - down[0]!, e.clientY - down[1]!) > 5) dragged = true; }
function pointerUp() { if (dragged) pickAfter = performance.now() + 250; down = undefined; }
function contextLost(e: Event) { e.preventDefault(); fail("WebGL上下文丢失，已切回二维地图"); }
function tooltip(params: unknown) {
  const item = params as { name?: string; data?: { count?: string; isTarget?: boolean } };
  const name = item.name ?? ""; const feature = props.asset.geo.features.find(f => f.properties.name === name);
  if (item.data?.isTarget) return `${props.serverTarget?.alias ?? "服务器"} · 有效目标`;
  if (item.data?.count) return `${feature?.properties.label ?? name} → ${props.serverTarget?.alias ?? "服务器"}\n请求 ${riskCount(item.data.count)}`;
  return `${feature?.properties.label ?? name}\n请求 ${riskCount(counts.value.exact.find(r => r.name === name)?.count)}`;
}
function lighting() { return { main: { intensity: 1.1, alpha: 45, beta: 30, shadow: false }, ambient: { intensity: .4 } }; }
function viewControl() { return { ...camera, autoRotate: false, minAlpha: 10, maxAlpha: 75, minBeta: -Infinity, maxBeta: Infinity, minDistance: 60, maxDistance: 300, rotateMouseButton: "left", panMouseButton: "right", damping: 0 }; }
function dataOptions(): Record<string, unknown> {
  const safe = counts.value.safe;
  const data = props.asset.geo.features.map(feature => { const exact = counts.value.exact.find(r => r.name === feature.properties.name)?.count; return { name: feature.properties.name, value: safe && exact ? Number(exact) : 0 }; });
  const max = Math.max(1, ...data.map(r => r.value));
  const regions = data.map(r => { const t = r.value / max; return { name: r.name, itemStyle: { color: safe ? `rgb(${Math.round(4+12*t)},${Math.round(71+139*t)},${Math.round(112+133*t)})` : "#064770" } }; });
  const target = flows.value.target;
  return {
    geo3D: { boxWidth: boxWidth.value, viewControl: { ...camera, autoRotate: false } },
    series: [
      { id: "risk3d-regions", type: "map3D", zlevel: -2, map: `risk-v1-${props.kind}`, coordinateSystem: "geo3D", boxWidth: boxWidth.value, boxHeight: 24, regionHeight: 1.5, viewControl: viewControl(), shading: "lambert", postEffect: { enable: false }, temporalSuperSampling: { enable: false }, light: lighting(), label: { show: false }, itemStyle: { color: "#064770", borderColor: "#35eaff", borderWidth: 1 }, emphasis: { label: { show: false }, itemStyle: { color: "#55edff" } }, data: regions },
      { id: "risk3d-flows", type: "lines3D", zlevel: -1, coordinateSystem: "geo3D", polyline: true, silent: true, effect: { show: false }, data: flows.value.lines.map(line => ({ name: line.name, coords: riskArc3D(line.coords), count: line.count, lineStyle: line.lineStyle })) },
      { id: "risk3d-sources", type: "scatter3D", zlevel: -1, coordinateSystem: "geo3D", silent: true, symbol: "circle", symbolSize: 6, itemStyle: { color: "#57f5ff" }, data: flows.value.lines.map(line => ({ name: line.name, value: [...line.coords[0]!, .02] })) },
      { id: "risk3d-source-halos", type: "scatter3D", zlevel: -1, coordinateSystem: "geo3D", silent: true, symbolSize: 16, itemStyle: { color: "#40edff", opacity: .16 }, data: flows.value.lines.map(line => ({ value: [...line.coords[0]!, .02] })) },
      { id: "risk3d-target-halo", type: "scatter3D", zlevel: -1, coordinateSystem: "geo3D", silent: true, symbolSize: 28, itemStyle: { color: "#ffd18c", opacity: .2 }, data: target ? [{ value: [...target, .02] }] : [] },
      { id: "risk3d-target", type: "scatter3D", zlevel: -1, coordinateSystem: "geo3D", symbol: "circle", symbolSize: 14, itemStyle: { color: "#ffd18c" }, data: flows.value.target ? [{ name: props.serverTarget?.alias ?? "服务器", isTarget: true, value: [...flows.value.target, .02] }] : [] },
      // Invisible height references use only the configured target coordinates; no visitor is invented.
      { id: "risk3d-height-range", type: "scatter3D", zlevel: -1, coordinateSystem: "geo3D", silent: true, symbolSize: 0, itemStyle: { opacity: 0 }, data: target ? [[...target, 0], [...target, 1]] : [] },
    ],
  };
}
function update() {
  if (!chart || disposed || lost || document.visibilityState === "hidden") return;
  try { chart.setOption(dataOptions() as EChartsCoreOption, { replaceMerge: ["series"], lazyUpdate: true }); } catch { fail("三维地图更新失败，已切回二维地图"); }
}
function setCamera(value: RiskCamera3D) {
  camera = normalizeRiskCamera(value); cameraSnapshot.value = camera; emit("cameraChange", camera);
  chart?.setOption({ geo3D: { viewControl: viewControl() }, series: [{ id: "risk3d-regions", viewControl: viewControl() }] } as EChartsCoreOption);
}
function keydown(event: KeyboardEvent) { const next = riskCameraKey(camera, event.key); if (next) { event.preventDefault(); setCamera(next); } }
function visibility() { if (document.visibilityState === "hidden") chart?.getZr().animation.stop(); else { chart?.getZr().animation.start(); update(); chart?.resize(); } }
defineExpose({ zoom: (factor: number) => setCamera({ ...camera, distance: camera.distance / factor }), resetView: () => setCamera(defaultRiskCamera()) });
onMounted(async () => {
  try {
    const runtime = await import("@/charts/risk3d");
    if (disposed || !root.value) return;
    fitFrame();
    chart = runtime.echarts.init(root.value, undefined, { renderer: "canvas", devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
    chart.on("geo3dcamerachanged", (event: unknown) => { camera = normalizeRiskCamera({ ...camera, ...(event as Partial<RiskCamera3D>) }); cameraSnapshot.value = camera; emit("cameraChange", camera); });
    chart.on("map3dcamerachanged", (event: unknown) => { camera = normalizeRiskCamera({ ...camera, ...(event as Partial<RiskCamera3D>) }); cameraSnapshot.value = camera; emit("cameraChange", camera); });
    chart.on("click", (event: unknown) => {
      if (dragged || performance.now() < pickAfter) return;
      const name = (event as { name?: string }).name;
      const feature = props.asset.geo.features.find(f => f.properties.name === name);
      if (feature?.properties.code) emit("regionSelect", feature.properties.code);
    });
    chart.setOption({ animation: false, tooltip: { renderMode: "richText", formatter: tooltip }, geo3D: { map: `risk-v1-${props.kind}`, zlevel: -1, show: false, regionHeight: 1.5, boxWidth: boxWidth.value, boxHeight: 24, shading: "lambert", itemStyle: { color: "#064770", borderColor: "#35eaff", borderWidth: 1 }, label: { show: false }, emphasis: { label: { show: false }, itemStyle: { color: "#55edff" } }, environment: "none", viewControl: { ...camera, autoRotate: false, minAlpha: 10, maxAlpha: 75, minBeta: -Infinity, maxBeta: Infinity, minDistance: 60, maxDistance: 300, rotateMouseButton: "left", panMouseButton: "right", damping: 0 }, postEffect: { enable: false }, temporalSuperSampling: { enable: false }, light: { main: { intensity: 1.1, alpha: 45, beta: 30, shadow: false }, ambient: { intensity: .4 } } }, series: dataOptions().series } as EChartsCoreOption);
    update();
    if (import.meta.env.DEV) {
      let frames = 0; let totalRenderMs = 0; let maxRenderMs = 0;
      const started = performance.now();
      chart.getZr().on("rendered", (event: { elapsedTime?: number }) => { const elapsed = event.elapsedTime ?? 0; totalRenderMs += elapsed; maxRenderMs = Math.max(maxRenderMs, elapsed); root.value?.setAttribute("data-rendered-frames", String(++frames)); root.value?.setAttribute("data-rendered-ms", String(performance.now() - started)); root.value?.setAttribute("data-render-mean-ms", String(totalRenderMs / frames)); root.value?.setAttribute("data-render-max-ms", String(maxRenderMs)); });
    }
    chart.getZr().flush();
    // ECharts-GL can swallow a renderer error and insert this failure element.
    if (root.value.querySelector(".ecgl-nowebgl")) { fail("WebGL渲染器创建失败，已切回二维地图"); return; }
    observer = new ResizeObserver(() => { if (document.visibilityState !== "hidden") { const changed = fitFrame(); chart?.resize(); if (changed) update(); } }); observer.observe(root.value);
    visibility();
  } catch { fail("三维模块或WebGL初始化失败，已切回二维地图"); }
});
watch(() => [props.regions, props.serverTarget], update, { deep: true });
onMounted(() => document.addEventListener("visibilitychange", visibility));
onBeforeUnmount(() => { disposed = true; document.removeEventListener("visibilitychange", visibility); cleanupChart(); });
</script>
<template>
  <div ref="root" class="risk-map-3d base-chart" role="img" aria-label="可旋转三维地域地图。方向键旋转倾斜，加减号缩放，0复位；地域下钻也可使用地域排行按钮。" :data-view-alpha="cameraSnapshot.alpha" :data-view-beta="cameraSnapshot.beta" :data-view-distance="cameraSnapshot.distance" :data-view-center="cameraSnapshot.center.join(',')" tabindex="0" :style="{ height }" @keydown="keydown" @contextmenu.prevent @pointerdown.capture="pointerDown" @pointermove.capture="pointerMove" @pointerup.capture="pointerUp" @pointercancel.capture="pointerUp" @webglcontextlost.capture="contextLost" />
</template>
<style scoped>
.risk-map-3d { width: 100%; min-height: 160px; touch-action: none; }
.risk-map-3d:focus-visible { outline: 2px solid var(--risk-accent, #2de7eb); outline-offset: -3px; }
</style>
