<script setup lang="ts">
import { computed, ref } from "vue";
import { positions } from "@/api/portfolio";
import DailyEntryDrawer from "@/components/portfolio/DailyEntryDrawer.vue";
import PositionDetailDrawer from "@/components/portfolio/PositionDetailDrawer.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { usePortfolioPage } from "@/composables/usePortfolioPage";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { assetName, formatMoney, formatTradeDate, signedMoney } from "@/utils/portfolio";
import type { EntityId } from "@/types/api";
import type { PortfolioPosition } from "@/types/portfolio";
import "@/styles/portfolio.css";

const page = usePortfolioPage(positions.page);
page.query.holdingOnly = true;
const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "portfolio:position:update"));
const selected = ref<EntityId>();
const opened = ref(false);
const recording = ref(false);
const current = ref<PortfolioPosition>();

function record(position?: PortfolioPosition) {
  current.value = position;
  recording.value = true;
}

function detail(id: EntityId) {
  selected.value = id;
  opened.value = true;
}

function reset() {
  Object.assign(page.query, { keyword: undefined, assetType: undefined, holdingOnly: true });
  void page.load(true);
}
</script>
<template>
  <section class="portfolio-page">
    <header class="portfolio-header">
      <div>
        <h1 class="page-title">我的持仓</h1>
        <p class="page-description">收盘后按日记录 · 同日覆盖 · 历史可追溯</p>
      </div>
      <div class="portfolio-inline">
        <el-button v-if="canUpdate" type="primary" @click="record()">新增标的</el-button>
        <PortfolioTips
          title="记录口径"
          content="收盘后录入当日数量、总市值和总成本；同一日期重复保存会覆盖当日记录。平均成本、参考价和浮动盈亏由系统计算，不读取实时行情。"
        />
      </div>
    </header>
    <section class="page-panel portfolio-panel">
      <div class="portfolio-filters">
        <el-input v-model="page.query.keyword" clearable placeholder="代码或名称" @keyup.enter="page.load(true)" />
        <el-select v-model="page.query.assetType" clearable placeholder="资产类型">
          <el-option label="股票" value="STOCK" />
          <el-option label="ETF" value="ETF" />
        </el-select>
        <el-checkbox v-model="page.query.holdingOnly">仅有持仓</el-checkbox>
        <el-button @click="page.load(true)">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
      <el-alert v-if="page.error.value" :title="page.error.value" type="error" :closable="false" />
      <el-table v-loading="page.loading.value" :data="page.rows.value" empty-text="暂无持仓，可新增标的">
        <el-table-column label="标的" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.nameSnapshot }}</strong>
            <div class="portfolio-muted">{{ row.symbol }} · {{ assetName(row.assetType) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="90" />
        <el-table-column label="总成本（元）" align="right" min-width="145">
          <template #default="{ row }">{{ formatMoney(row.totalCost) }}</template>
        </el-table-column>
        <el-table-column label="总市值（元）" align="right" min-width="145">
          <template #default="{ row }">{{ formatMoney(row.marketValue) }}</template>
        </el-table-column>
        <el-table-column label="平均成本（元）" align="right" min-width="140">
          <template #default="{ row }">{{ formatMoney(row.averageCost) }}</template>
        </el-table-column>
        <el-table-column label="参考价格（元）" align="right" min-width="140">
          <template #default="{ row }">{{ formatMoney(row.referencePrice) }}</template>
        </el-table-column>
        <el-table-column label="持仓浮动盈亏（元）" align="right" min-width="175">
          <template #default="{ row }">{{ signedMoney(row.unrealizedPnl) }}</template>
        </el-table-column>
        <el-table-column label="盈亏率" align="right" min-width="115">
          <template #default="{ row }">{{ row.unrealizedRate == null ? '—' : formatMoney(row.unrealizedRate) + '%' }}</template>
        </el-table-column>
        <el-table-column label="最新记录日" min-width="125">
          <template #default="{ row }">{{ formatTradeDate(row.tradeDate) }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="canUpdate ? 170 : 100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="detail(row.id)">查看详情</el-button>
            <el-button v-if="canUpdate" link @click="record(row as PortfolioPosition)">记录</el-button>
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
    <PositionDetailDrawer v-model="opened" :id="selected" @changed="page.load()" />
    <DailyEntryDrawer v-if="canUpdate" v-model="recording" :position="current" @saved="page.load()" />
  </section>
</template>
