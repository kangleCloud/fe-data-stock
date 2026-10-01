<script setup lang="ts">
import { computed } from "vue";

import type { SnapshotStatus } from "@/types/market";
import { dataStatusLabels } from "@/utils/market";

const props = withDefaults(
  defineProps<{
    title: string;
    status?: SnapshotStatus;
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
const showInitialLoading = computed(() => props.loading && !props.hasData);
const showEmptyState = computed(
  () =>
    !props.hasData &&
    !props.loading &&
    props.status === "ERROR",
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
          <i />
          {{ stateText }}
        </span>
      </div>
      <slot name="actions" />
    </header>
    <div v-if="showInitialLoading" class="market-panel__skeleton" aria-label="数据加载中">
      <slot name="skeleton">
        <span v-for="item in 3" :key="item" />
      </slot>
    </div>
    <div v-else-if="showEmptyState" class="market-empty">
      <strong>{{ stateText }}</strong>
      <span>{{ message || "当前模块没有可展示的数据" }}</span>
      <slot name="retry" />
    </div>
    <slot v-else />
  </section>
</template>
