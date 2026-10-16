<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessageBox } from "element-plus";
import {
  getPortfolioContext,
  getPortfolioContexts,
  trades,
} from "@/api/portfolio";
import TradeDetailDrawer from "@/components/portfolio/TradeDetailDrawer.vue";
import TradeDrawer from "@/components/portfolio/TradeDrawer.vue";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { usePortfolioPage } from "@/composables/usePortfolioPage";
import { useAuthStore } from "@/stores/auth";
import type {
  PortfolioCommandContext,
  PortfolioTrade,
} from "@/types/portfolio";
import { canAccess } from "@/utils/permission";
import { errorText, formatMoney, statusNames } from "@/utils/portfolio";
import "@/styles/portfolio.css";
const auth = useAuthStore();
const can = (p: string) => canAccess(auth.permissionCodes, p);
const page = usePortfolioPage(trades.page);
const owned = ref<PortfolioCommandContext[]>([]);
const selected = ref<PortfolioCommandContext>();
const original = ref<PortfolioTrade>();
const kind = ref<"BUY" | "SELL" | "OPENING">("BUY");
const drawer = ref(false);
const pending = ref(false);
const detailId = ref<string | number>();
const detailOpen = ref(false);
const canWrite = computed(() =>
  canAccess(auth.permissionCodes, [
    "portfolio:trade:add",
    "portfolio:trade:void",
    "portfolio:opening:add",
  ]),
);
const canTrade = computed(() => can("portfolio:trade:add"));
async function reload() {
  await page.load();
  if (canWrite.value) {
    try {
      owned.value = (
        await getPortfolioContexts({ pageNum: 1, pageSize: 100 })
      ).list;
    } catch (caughtError) {
      page.error.value = errorText(caughtError);
    }
  }
}
onMounted(async () => {
  if (canWrite.value) {
    try {
      owned.value = (
        await getPortfolioContexts({ pageNum: 1, pageSize: 100 })
      ).list;
    } catch (caughtError) {
      page.error.value = errorText(caughtError);
    }
  }
});
async function open(type: typeof kind.value, row?: PortfolioTrade) {
  kind.value = type;
  original.value = row;
  if (row) {
    try {
      selected.value = await getPortfolioContext(row.positionId);
    } catch (caughtError) {
      page.error.value = errorText(caughtError);
      return;
    }
  }
  if (row && !selected.value) {
    page.error.value = "请刷新持仓信息后更正";
    return;
  }
  drawer.value = true;
}
async function voidRecord(row: PortfolioTrade) {
  if (pending.value) {
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt(
      "将回放后续记录并保留原流水，请填写作废原因。",
      "作废交易",
      { inputValidator: (v) => !!v?.trim() || "请填写原因", type: "warning" },
    );
    pending.value = true;
    const p = await getPortfolioContext(row.positionId);
    await trades.void({
      id: row.id,
      expectedVersion: p.version,
      reason: value,
    });
    await reload();
  } catch (caughtError) {
    if (caughtError !== "cancel" && caughtError !== "close") {
      page.error.value = errorText(caughtError);
    }
  } finally {
    pending.value = false;
  }
}
async function searchContexts(keyword: string) {
  try {
    owned.value = (
      await getPortfolioContexts({ keyword, pageNum: 1, pageSize: 100 })
    ).list;
  } catch (caughtError) {
    page.error.value = errorText(caughtError);
  }
}
</script>
<template>
  <section class="portfolio-page">
    <header class="portfolio-header">
      <div>
        <h1 class="page-title">交易记录</h1>
        <p class="page-description">人工成交 · 费用依据 · 可追溯更正</p>
      </div>
      <PortfolioTips
        title="记账说明"
        content="成交和费用由人工确认，不使用行情自动记账。新增及更正先预览，历史修改将重放后续记录。作废记录保留，不删除。"
      />
    </header>
    <section class="page-panel portfolio-panel">
      <div class="portfolio-toolbar">
        <el-select
          v-if="canWrite"
          v-model="selected"
          filterable
          remote
          :remote-method="searchContexts"
          value-key="id"
          clearable
          placeholder="选择已有持仓（可选）"
          style="width: 260px"
        >
          <el-option
            v-for="p in owned"
            :key="String(p.id)"
            :value="p"
            :label="`${p.nameSnapshot} ${p.symbol} · ${p.currentQuantity}`"
          />
        </el-select>
        <el-button v-if="canTrade" type="primary" @click="open('BUY')">
          录入买入
        </el-button>
        <el-button
          v-if="canTrade"
          :disabled="!selected || selected.currentQuantity <= 0"
          @click="open('SELL')"
        >
          录入卖出
        </el-button>
        <el-button v-if="can('portfolio:opening:add')" @click="open('OPENING')">
          期初录入
        </el-button>
      </div>
    </section>
    <section class="page-panel portfolio-panel">
      <div class="portfolio-filters">
        <el-select
          v-model="page.query.assetType"
          clearable
          placeholder="资产类型"
        >
          <el-option label="股票" value="STOCK" />
          <el-option label="ETF" value="ETF" />
        </el-select>
        <el-input
          v-model="page.query.keyword"
          placeholder="标的名称关键词"
          clearable
        />
        <el-select
          v-model="page.query.tradeType"
          clearable
          placeholder="交易类型"
        >
          <el-option
            v-for="t in ['BUY', 'SELL', 'OPENING']"
            :key="t"
            :value="t"
            :label="statusNames[t]"
          />
        </el-select>
        <el-select
          v-model="page.query.recordStatus"
          clearable
          placeholder="记录状态"
        >
          <el-option label="有效" value="ACTIVE" />
          <el-option label="作废" value="VOID" />
        </el-select>
        <el-date-picker
          v-model="page.query.dateFrom"
          value-format="YYYY-MM-DD"
          placeholder="起始日期"
        />
        <el-date-picker
          v-model="page.query.dateTo"
          value-format="YYYY-MM-DD"
          placeholder="截止日期"
        />
        <el-button @click="page.load(true)">查询</el-button>
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
        empty-text="暂无交易记录"
      >
        <el-table-column prop="businessDate" label="业务日期" width="115" />
        <el-table-column prop="nameSnapshot" label="标的" min-width="130" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <PortfolioStatus :value="row.tradeType" />
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column label="价格" width="125">
          <template #default="{ row }">
            {{ formatMoney(row.price) }}
          </template>
        </el-table-column>
        <el-table-column label="金额 / 期初成本" width="150">
          <template #default="{ row }">
            {{ formatMoney(row.grossAmount ?? row.openingCost) }}
          </template>
        </el-table-column>
        <el-table-column label="费用口径" width="105">
          <template #default="{ row }">
            <PortfolioStatus :value="row.feeMode" />
          </template>
        </el-table-column>
        <el-table-column label="交易盈亏" width="130">
          <template #default="{ row }">
            {{ formatMoney(row.finalPnl) }}
          </template>
        </el-table-column>
        <el-table-column label="确认" width="110">
          <template #default="{ row }">
            <PortfolioStatus :value="row.confirmationStatus" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <PortfolioStatus :value="row.recordStatus" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              @click="
                detailId = row.id;
                detailOpen = true;
              "
            >
              详情
            </el-button>
            <el-button
              v-if="
                canTrade &&
                  can('portfolio:trade:void') &&
                  (row.tradeType !== 'OPENING' || can('portfolio:opening:add'))
              "
              link
              :disabled="row.recordStatus === 'VOID' || pending"
              @click="open(row.tradeType, row as PortfolioTrade)"
            >
              原子更正
            </el-button>
            <el-button
              v-if="
                can('portfolio:trade:void') &&
                  (row.tradeType !== 'OPENING' || can('portfolio:opening:add'))
              "
              link
              type="danger"
              :disabled="row.recordStatus === 'VOID' || pending"
              @click="voidRecord(row as PortfolioTrade)"
            >
              作废
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
    <TradeDetailDrawer v-model="detailOpen" :id="detailId" />
    <TradeDrawer
      v-if="drawer"
      v-model="drawer"
      :kind="kind"
      :position="selected"
      :original="original"
      @saved="reload"
    />
  </section>
</template>
