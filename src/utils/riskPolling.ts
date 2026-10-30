/** 单任务轮询：筛选失效后丢弃旧响应，前一请求结束前不启动后续请求。 */
export function createRiskPolling<T>(options: {
  load: () => Promise<T>;
  accept: (result: T) => void;
  reject: (error: unknown) => void;
  visible: () => boolean;
  intervalMs?: number;
  auto?: boolean;
}) {
  let revision = 0;
  let running = false;
  let stopped = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    clearTimeout(timer);
    timer = undefined;
  }
  async function refresh(): Promise<void> {
    clear();
    if (stopped || !options.visible()) return;
    if (running) { pending = true; return; }
    pending = false;
    running = true;
    const current = revision;
    try {
      const result = await options.load();
      if (!stopped && current === revision && options.visible()) options.accept(result);
    } catch (error) {
      if (!stopped && current === revision && options.visible()) options.reject(error);
    } finally {
      running = false;
      if (!stopped && options.visible()) {
        if (pending) { pending = false; void refresh(); }
        else if (options.auto !== false) timer = setTimeout(() => void refresh(), options.intervalMs ?? 10_000);
      }
    }
  }
  return {
    refresh,
    invalidate() { revision++; void refresh(); },
    visibilityChanged() { revision++; clear(); if (options.visible()) void refresh(); },
    stop() { stopped = true; revision++; pending = false; clear(); },
  };
}
