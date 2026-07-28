import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useMarketStore } from "@/stores/market";

describe("market store module snapshots", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps a stale module snapshot on refresh failure and clears it on recovery", () => {
    const store = useMarketStore();
    store.markModule("indices", {
      data: [{ code: "000001" }],
      dataStatus: "FRESH",
      lastSuccessAt: "2026-07-28T10:00:00+08:00",
    });
    store.markModuleFailure("indices", "刷新失败", true);

    expect(store.modules.indices).toMatchObject({
      status: "STALE",
      message: "刷新失败",
      lastSuccessAt: "2026-07-28T10:00:00+08:00",
    });

    store.markModule("indices", {
      data: [{ code: "000001" }],
      dataStatus: "FRESH",
      lastSuccessAt: "2026-07-28T10:00:40+08:00",
    });
    expect(store.modules.indices).toMatchObject({
      status: "FRESH",
      message: undefined,
    });
  });

  it("stores the selected index for market-fund linkage", () => {
    const store = useMarketStore();
    store.selectIndex("399006");
    expect(store.selectedIndexCode).toBe("399006");
  });
});
