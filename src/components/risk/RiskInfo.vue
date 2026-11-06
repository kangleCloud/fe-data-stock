<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";

defineProps<{ label: string }>();
const id = useId();
const pinned = ref(false);
const hovered = ref(false);
const dismissed = ref(false);
const visible = computed(() => pinned.value || (hovered.value && !dismissed.value));
function toggle() {
  pinned.value = !pinned.value;
  dismissed.value = !pinned.value;
}
function close() {
  pinned.value = false;
  dismissed.value = true;
}
</script>

<template>
  <span class="access-info" @pointerenter="hovered = true; dismissed = false" @pointerleave="hovered = false">
    <button type="button" class="access-info-button" :aria-label="label" :aria-expanded="visible" :aria-controls="id" @click="toggle" @blur="close" @keydown.esc.stop="close">
      <InfoFilled aria-hidden="true" />
    </button>
    <span v-show="visible" :id="id" class="access-info-content"><slot /></span>
  </span>
</template>
