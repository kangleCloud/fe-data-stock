<script setup lang="ts">
import { computed } from "vue";
import { riskCount } from "@/utils/risk";
import { riskBarWidths } from "@/utils/riskBars";
export interface RiskBarRow { key: string; label: string; count: string; selectable?: boolean; tone?: "danger" | "muted" }
const props = defineProps<{ rows: RiskBarRow[]; label: string; ranked?: boolean }>();
const emit = defineEmits<{ select: [key: string] }>();
const widths = computed(() => riskBarWidths(props.rows.map(row => row.count)));
</script>
<template>
  <ul class="risk-bars" :class="{ 'risk-bars-ranked': ranked }" :aria-label="label">
    <li v-for="(row, index) in rows" :key="row.key" :class="row.tone">
      <span v-if="ranked" class="risk-rank" aria-hidden="true">{{ index + 1 }}</span>
      <button v-if="row.selectable" type="button" class="risk-bar-label" :title="row.label" @click="emit('select', row.key)">{{ row.label }}</button><span v-else class="risk-bar-label" :title="row.label">{{ row.label }}</span>
      <span v-if="widths[index] !== null" class="risk-bar-track" aria-hidden="true"><i :style="{ width: `${widths[index]}%` }" /></span>
      <strong class="risk-bar-value">{{ riskCount(row.count) }}</strong>
    </li>
  </ul>
  <p v-if="widths.some(value => value === null)" class="risk-precision-note">计数超出安全绘图精度，仅显示精确数字。</p>
</template>
