<script setup lang="ts">
import type { EChartsCoreOption } from "echarts/core";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { echarts } from "@/charts/echarts";
import BaseChart from "@/components/market/BaseChart.vue";
import { riskCount, riskRegion } from "@/utils/risk";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
const props = defineProps<{ regions: { regionCode: string; requestCount: string }[] }>();
const kind = ref<RiskMapKind>("china");
const loaded = shallowRef<RiskMapAsset>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const loader = createRiskMapLoader();
let revision = 0;
let disposed = false;
async function selectMap(next: RiskMapKind) {
  kind.value = next;
  const current = ++revision;
  loaded.value = undefined; state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision) return;
    echarts.registerMap(`risk-v1-${next}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
    loaded.value = asset; state.value = "ready";
  } catch { if (!disposed && current === revision) state.value = "unavailable"; }
}
const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const option = computed<EChartsCoreOption>(() => {
  const exact = new Map(counts.value?.exact.map((item) => [item.name, item.count]));
  const labels = new Map(loaded.value?.geo.features.map((feature) => [feature.properties.name, feature.properties.label]));
  const safe = counts.value?.safe ?? true;
  const data = safe ? counts.value?.exact.map((item) => ({ name: item.name, value: Number(item.count) })) ?? [] : [];
  return {
    animation: false, aria: { enabled: true, label: { description: `${kind.value === "china" ? "中国省级" : "世界国家"}请求数地图；无统计的地域仅显示边界，精确计数与未定位来源见下方列表。` } },
    tooltip: { renderMode: "richText", formatter: (params: unknown) => {
      const name = (params as { name?: string }).name ?? "";
      return `${labels.get(name) ?? name}\n请求：${exact.has(name) ? riskCount(exact.get(name)) : "无可定位统计"}`;
    } },
    visualMap: safe && data.length ? { min: 0, max: Math.max(1, ...data.map((item) => item.value)), left: 0, bottom: 0, text: ["请求多", "少"], textStyle: { color: "#abc7e0" }, inRange: { color: ["#173d65", "#39d9ed"] }, calculable: false } : undefined,
    series: [{ type: "map", map: `risk-v1-${kind.value}`, roam: false, selectedMode: false, layoutCenter: ["50%", "45%"], layoutSize: "95%", label: { show: false }, itemStyle: { areaColor: "#112d49", borderColor: "#5c9ac1", borderWidth: .6 }, emphasis: { label: { show: false }, itemStyle: { areaColor: "#327597" } }, data }],
  };
});
onMounted(() => void selectMap("china"));
onBeforeUnmount(() => { disposed = true; revision++; loader.stop(); loaded.value = undefined; });
</script>

<template>
  <div class="risk-region-map">
    <div class="risk-controls" role="group" aria-label="地图范围"><button type="button" :aria-pressed="kind === 'china'" @click="selectMap('china')">中国</button><button type="button" :aria-pressed="kind === 'world'" @click="selectMap('world')">世界</button></div>
    <p v-if="state === 'loading'" role="status">正在加载地图边界…</p>
    <div v-else-if="state === 'unavailable'" class="risk-map-unavailable" role="status"><strong>地图暂不可用</strong><p>本地资源与固定版本补偿均未成功；地域排行与其他统计仍可查看。</p></div>
    <template v-else>
      <BaseChart :key="kind" :option="option" :accessible-label="`${kind === 'china' ? '中国省级' : '世界国家'}请求数地图；精确数据见下方列表，无定位来源单列`" height="340px" />
      <p v-if="!counts?.safe" class="risk-warning">请求数超出安全绘图精度，仅显示边界；精确计数见下方。</p>
      <p v-else-if="!counts?.exact.length" class="risk-muted">无可定位请求数据，仅展示边界。</p>
      <p class="risk-muted">{{ loaded?.origin === 'local' ? '本地离线边界' : '固定版本外部补偿边界' }} · 请求次数，不代表每日来源估算。</p>
      <details><summary>本图精确计数与未定位来源</summary><ul class="risk-list"><li v-for="row in counts?.exact" :key="row.name"><span>{{ riskRegion(row.name) }}</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in counts?.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul></details>
    </template>
    <details class="risk-notes"><summary>地图来源与边界说明</summary><p>geoBoundaries CHN ADM1（代表2019，34单元）与 Natural Earth 1:110m，均为公有领域数据，固定版本随应用发布。边界仅用于访问统计展示；HK/MO/TW按统计编码显式映射，微小地域无本图边界时单列。来源与SHA见本端地图资产文档。</p><p>本地资源不可用时，每种地图每次页面访问最多尝试一次固定版本外部资源，不传业务鉴权、日志或内部地址；对方可见浏览器网络出口IP。</p></details>
  </div>
</template>
