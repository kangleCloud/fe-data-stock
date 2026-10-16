<script setup lang="ts">
import { computed, ref } from "vue";
import { positions } from "@/api/portfolio";
import PositionDrawer from "@/components/portfolio/PositionDrawer.vue";
import TradeDrawer from "@/components/portfolio/TradeDrawer.vue";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { usePortfolioPage } from "@/composables/usePortfolioPage";
import { useAuthStore } from "@/stores/auth";
import type { EntityId } from "@/types/api";
import { canAccess } from "@/utils/permission";
import {
  assetName,
  cutoffForDate,
  formatMoney,
  localDate,
} from "@/utils/portfolio";
import "@/styles/portfolio.css";
const page = usePortfolioPage(positions.page);
page.query.holdingOnly = true;
const auth = useAuthStore();
const can = (p: string) => canAccess(auth.permissionCodes, p);
const selected = ref<EntityId>();
const opened = ref(false);
const tradeOpen = ref(false);
const date = ref("");
const asOf = computed(() => page.appliedQuery.value.asOf);
function search() {
  page.query.asOf = cutoffForDate(date.value);
  void page.load(true);
}
function detail(id: EntityId) {
  selected.value = id;
  opened.value = true;
}
function isFutureDate(d: Date) {
  return (
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d) >
    localDate()
  );
}
</script>
<template>
  <section class="portfolio-page">
    <header class="portfolio-header">
      <div>
        <h1 class="page-title">我的持仓</h1>
        <p class="page-description">
          个人账本 · 股票与ETF · 成本与估值分开核验
        </p>
      </div>
      <div>
        <el-button
          v-if="can('portfolio:opening:add') && !asOf"
          type="primary"
          @click="tradeOpen = true"
        >
          期初录入
        </el-button>
        <PortfolioTips
          title="持仓口径"
          content="同标的清仓后保留身份，重新买入开启新周期。金额来自账本和手工估值，不等于实时行情市值。未补充的公司行动可能影响准确性，需手工处理。"
        />
      </div>
    </header>
    <section class="page-panel portfolio-panel">
      <div class="portfolio-filters">
        <el-input
          v-model="page.query.keyword"
          clearable
          placeholder="代码或名称"
          @keyup.enter="search"
        />
        <el-select
          v-model="page.query.assetType"
          clearable
          placeholder="资产类型"
        >
          <el-option label="股票" value="STOCK" />
          <el-option label="ETF" value="ETF" />
        </el-select>
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="历史截止日"
          :disabled-date="isFutureDate"
        />
        <el-select v-model="page.query.sortBy" clearable placeholder="排序指标">
          <el-option label="剩余成本" value="remainingCost" />
          <el-option label="浮动盈亏" value="unrealizedPnl" />
        </el-select>
        <el-select
          v-model="page.query.sortDirection"
          clearable
          placeholder="排序方向"
        >
          <el-option label="升序" value="ASC" />
          <el-option label="降序" value="DESC" />
        </el-select>
        <el-checkbox v-model="page.query.holdingOnly">仅有持仓</el-checkbox>
        <el-button @click="search">查询</el-button>
        <el-button
          @click="
            date = '';
            page.query.keyword = undefined;
            page.query.assetType = undefined;
            page.query.holdingOnly = true;
            page.query.sortBy = undefined;
            page.query.sortDirection = undefined;
            search();
          "
        >
          重置
        </el-button>
      </div>
      <el-alert
        v-if="page.error.value"
        :title="page.error.value"
        type="error"
        :closable="false"
      />
      <el-table
        v-loading="page.loading.value"
        :data="page.rows.value"
        empty-text="暂无持仓，可从期初录入或买入开始记账"
      >
        <el-table-column label="标的" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.nameSnapshot }}</strong>
            <div class="portfolio-muted">
              {{ row.symbol }} · {{ assetName(row.assetType) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="currentQuantity" label="数量" width="100" />
        <el-table-column label="剩余成本（元）" width="155">
          <template #default="{ row }">
            {{ formatMoney(row.remainingCost) }}
          </template>
        </el-table-column>
        <el-table-column label="平均成本（元）" width="150">
          <template #default="{ row }">
            {{ formatMoney(row.averageCost) }}
          </template>
        </el-table-column>
        <el-table-column label="交易已实现（元）" width="155">
          <template #default="{ row }">
            {{ formatMoney(row.realizedPnl) }}
          </template>
        </el-table-column>
        <el-table-column label="手工估值市值（元）" width="165">
          <template #default="{ row }">
            {{ formatMoney(row.marketValue) }}
          </template>
        </el-table-column>
        <el-table-column label="浮盈（元）" width="140">
          <template #default="{ row }">
            {{ formatMoney(row.unrealizedPnl) }}
          </template>
        </el-table-column>
        <el-table-column label="核验状态" width="210">
          <template #default="{ row }">
            <PortfolioStatus :value="row.costStatus" />
            <PortfolioStatus :value="row.pnlStatus" />
            <div v-if="row.pendingActionCount" class="portfolio-muted">
              待处理行动 {{ row.pendingActionCount }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="95" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="detail(row.id)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page.query.pageNum"
          :page-size="10"
          :total="page.total.value"
          layout="total, prev, pager, next"
          @current-change="page.load()"
        />
      </div>
    </section>
    <PositionDrawer
      v-model="opened"
      :id="selected"
      :as-of="asOf"
      @changed="page.load()"
    />
    <TradeDrawer v-model="tradeOpen" kind="OPENING" @saved="page.load()" />
  </section>
</template>
