import { vi } from "vitest";

export function installIntersectionObserver() {
  const observers: TestObserver[] = [];
  class TestObserver {
    readonly targets = new Set<Element>();
    readonly observe = vi.fn((target: Element) => {
      this.targets.add(target);
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 100000, bottom: 100020 } as DOMRect);
    });
    readonly unobserve = vi.fn((target: Element) => this.targets.delete(target));
    readonly disconnect = vi.fn(() => this.targets.clear());
    constructor(readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) { observers.push(this); }
    emit(isIntersecting: boolean): void {
      this.callback([...this.targets].map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry), this as unknown as IntersectionObserver);
    }
  }
  vi.stubGlobal("IntersectionObserver", TestObserver);
  return observers;
}
