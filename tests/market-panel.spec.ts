import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import MarketPanel from "@/components/market/MarketPanel.vue";

describe("MarketPanel", () => {
  it("shows a stable skeleton only for the initial load", () => {
    const wrapper = mount(MarketPanel, {
      props: {
        title: "核心指数",
        loading: true,
        hasData: false,
      },
    });

    expect(wrapper.find(".market-panel__skeleton").exists()).toBe(true);
    expect(wrapper.find(".market-empty").exists()).toBe(false);
    expect(wrapper.text()).toContain("刷新中");
  });

  it("keeps existing content visible while a refresh is stale", () => {
    const wrapper = mount(MarketPanel, {
      props: {
        title: "市场总览",
        status: "STALE",
        loading: true,
        hasData: true,
      },
      slots: {
        default: "<div data-testid=\"snapshot\">上次有效数据</div>",
      },
    });

    expect(wrapper.find("[data-testid='snapshot']").text()).toBe("上次有效数据");
    expect(wrapper.find(".market-empty").exists()).toBe(false);
    expect(wrapper.text()).toContain("刷新中");
  });

  it("renders the error recovery action when no historical data exists", () => {
    const wrapper = mount(MarketPanel, {
      props: {
        title: "板块热力图",
        status: "ERROR",
        hasData: false,
        message: "板块数据加载失败",
      },
      slots: {
        retry: "<button type=\"button\">重新加载</button>",
      },
    });

    expect(wrapper.find(".market-empty").text()).toContain("板块数据加载失败");
    expect(wrapper.get("button").text()).toBe("重新加载");
  });
});
