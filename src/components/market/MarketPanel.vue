<script setup lang="ts">
import { computed } from "vue";

import type { MarketDataStatus } from "@/types/market";
import { dataStatusLabels } from "@/utils/market";

const props = withDefaults(
  defineProps<{
    title: string;
    status?: MarketDataStatus;
    loading?: boolean;
    message?: string;
    hasData?: boolean;
  }>(),
  {
    status: "FRESH",
    loading: false,
    message: "",
    hasData: true,
  },
);

const stateText = computed(() =>
  props.loading ? "刷新中" : dataStatusLabels[props.status],
);
</script>

<template>
  <section class="market-panel">
    <header class="market-panel__header">
      <div>
        <h2>{{ title }}</h2>
        <span
          v-if="loading || status !== 'FRESH'"
          class="market-panel__state"
          :class="`is-${status.toLowerCase()}`"
          aria-live="polite"
        >
          {{ stateText }}
        </span>
      </div>
      <slot name="actions" />
    </header>
    <div v-if="!hasData && (status === 'ERROR' || status === 'NO_DATA')" class="market-empty">
      <strong>{{ stateText }}</strong>
      <span>{{ message || "当前模块没有可展示的数据" }}</span>
      <slot name="retry" />
    </div>
    <slot v-else />
  </section>
</template>
