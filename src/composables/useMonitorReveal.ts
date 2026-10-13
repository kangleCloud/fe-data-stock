import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

const BATCH_SIZE = 4;
const MAX_CARDS = 10;

/** 仅展开已经读取的监控清单，不触发请求或重连。 */
export function useMonitorReveal<T extends { symbol: string }>(items: Ref<T[]>) {
  const limit = ref(BATCH_SIZE);
  const sentinel = ref<HTMLElement>();
  const list = ref<HTMLElement>();
  const visible = computed(() => items.value.slice(0, Math.min(limit.value, MAX_CARDS)));
  const hasMore = computed(() => visible.value.length < Math.min(items.value.length, MAX_CARDS));
  let observer: IntersectionObserver | undefined;
  let entered = false;
  let active = true;
  let appending = false;

  function revealMore(): void {
    if (active && hasMore.value) limit.value = Math.min(limit.value + BATCH_SIZE, MAX_CARDS);
  }

  async function appendVisible(): Promise<void> {
    if (!active || appending || !hasMore.value) return;
    appending = true;
    revealMore();
    await nextTick();
    appending = false;
    if (!active || !entered || !hasMore.value || !sentinel.value) return;
    // 渲染本批后再核对底部：短卡片尚未填满视口时继续展开，重复回调不会重复追加。
    const bounds = sentinel.value.getBoundingClientRect();
    if (bounds.top <= window.innerHeight + 240 && bounds.bottom >= 0) void appendVisible();
  }

  async function revealTarget(index: number): Promise<void> {
    const symbol = items.value[index]?.symbol;
    if (!active || !symbol || index >= MAX_CARDS) return;
    limit.value = Math.max(limit.value, Math.min(MAX_CARDS, Math.ceil((index + 1) / BATCH_SIZE) * BATCH_SIZE));
    await nextTick();
    if (!active) return;
    const card = [...(list.value?.querySelectorAll<HTMLElement>("[data-monitor-symbol]") ?? [])]
      .find((element) => element.dataset.monitorSymbol === symbol);
    card?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  onMounted(() => {
    if (typeof IntersectionObserver === "undefined") return;
    observer = new IntersectionObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        if (entry.target !== sentinel.value) continue;
        if (!entry.isIntersecting) entered = false;
        else if (!entered) {
          // 同一批观察器通知只处理一次，后续批次由渲染后的实际位置决定。
          entered = true;
          void appendVisible();
        }
      }
    }, { rootMargin: "0px 0px 240px 0px", threshold: 0 });
    if (sentinel.value) observer.observe(sentinel.value);
  });
  watch(sentinel, (element, previous) => {
    if (previous) observer?.unobserve(previous);
    entered = false;
    if (element) observer?.observe(element);
  }, { flush: "post" });
  onBeforeUnmount(() => { active = false; observer?.disconnect(); });

  return { visible, hasMore, sentinel, list, revealMore, revealTarget };
}
