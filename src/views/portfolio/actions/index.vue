<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessageBox } from "element-plus";
import {
  actions,
  getPortfolioContext,
  getPortfolioContexts,
} from "@/api/portfolio";
import ActionDrawer from "@/components/portfolio/ActionDrawer.vue";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { usePortfolioPage } from "@/composables/usePortfolioPage";
import { useAuthStore } from "@/stores/auth";
import type {
  PortfolioAction,
  PortfolioCommandContext,
} from "@/types/portfolio";
import { canAccess } from "@/utils/permission";
import { errorText, formatMoney } from "@/utils/portfolio";
import "@/styles/portfolio.css";
const auth = useAuthStore();
const can = (p: string) => canAccess(auth.permissionCodes, p);
const page = usePortfolioPage(actions.page);
const owned = ref<PortfolioCommandContext[]>([]);
const selected = ref<PortfolioCommandContext>();
const original = ref<PortfolioAction>();
const opened = ref(false);
const busy = ref(false);
const names: Record<string, string> = {
  CASH_DIVIDEND: "现金分红",
  BONUS_SHARES: "送转股",
  SPLIT: "拆分",
  RIGHTS: "配股",
  ETF_CONVERSION: "ETF折算",
  TAX_WITHHOLDING: "手工补扣税",
  OTHER: "其他",
};
onMounted(async () => {
  if (can("portfolio:action:update")) {
    try {
      owned.value = (
        await getPortfolioContexts({ pageNum: 1, pageSize: 100 })
      ).list;
    } catch (caughtError) {
      page.error.value = errorText(caughtError);
    }
  }
});
async function open(row?: PortfolioAction) {
  original.value = row;
  if (row) {
    try {
      selected.value = await getPortfolioContext(row.positionId);
    } catch (caughtError) {
      page.error.value = errorText(caughtError);
      return;
    }
  }
  if (selected.value) {
    opened.value = true;
  }
}
async function voidAction(row: PortfolioAction) {
  if (busy.value) {
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt(
      "作废后将重放该持仓后续记录。",
      "作废公司行动",
      { inputValidator: (v) => !!v?.trim() || "请填写原因", type: "warning" },
    );
    busy.value = true;
    const p = await getPortfolioContext(row.positionId);
    await actions.void({
      id: row.id,
      expectedVersion: p.version,
      reason: value,
    });
    await page.load();
  } catch (caughtError) {
    if (caughtError !== "cancel" && caughtError !== "close") {
      page.error.value = errorText(caughtError);
    }
  } finally {
    busy.value = false;
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
        <h1 class="page-title">公司行动</h1>
        <p class="page-description">
          人工记录 · 待处理与生效分离 · 现金独立累计
        </p>
      </div>
      <PortfolioTips
        title="处理说明"
        content="不自动计算分红税率、送转比例、拆分和ETF份额折算。待处理记录不参与核算；确认生效后须明确填写数量、成本、现金三项调整。已生效记录通过原子替代更正。"
      />
    </header>
    <section class="page-panel portfolio-panel">
      <div v-if="can('portfolio:action:update')" class="portfolio-toolbar">
        <el-select
          v-model="selected"
          filterable
          remote
          :remote-method="searchContexts"
          value-key="id"
          placeholder="选择本人的持仓"
          style="width: 280px"
        >
          <el-option
            v-for="p in owned"
            :key="String(p.id)"
            :value="p"
            :label="`${p.nameSnapshot} ${p.symbol}`"
          />
        </el-select>
        <el-button type="primary" :disabled="!selected" @click="open()">
          记录公司行动
        </el-button>
      </div>
      <div class="portfolio-filters">
        <el-select
          v-model="page.query.recordStatus"
          clearable
          placeholder="处理状态"
        >
          <el-option label="待处理" value="PENDING" />
          <el-option label="已生效" value="ACTIVE" />
          <el-option label="作废" value="VOID" />
        </el-select>
        <el-select v-model="page.query.actionType" clearable placeholder="类型">
          <el-option
            v-for="(name, value) in names"
            :key="value"
            :label="name"
            :value="value"
          />
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
        empty-text="暂无公司行动"
      >
        <el-table-column prop="businessDate" label="生效日期" width="115" />
        <el-table-column label="持仓" min-width="130">
          <template #default="{ row }">
            {{
              owned.find((p) => String(p.id) === String(row.positionId))
                ?.nameSnapshot || `持仓 #${row.positionId}`
            }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ names[row.actionType] || row.actionType }}
          </template>
        </el-table-column>
        <el-table-column prop="quantityDelta" label="数量调整" width="100" />
        <el-table-column label="成本调整（元）" width="135">
          <template #default="{ row }">
            {{ formatMoney(row.costDelta) }}
          </template>
        </el-table-column>
        <el-table-column label="现金收益（元）" width="135">
          <template #default="{ row }">
            {{ formatMoney(row.cashIncome) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="reason"
          label="原因"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <PortfolioStatus :value="row.recordStatus" />
          </template>
        </el-table-column>
        <el-table-column
          v-if="can('portfolio:action:update')"
          label="操作"
          width="165"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              :disabled="row.recordStatus === 'VOID' || busy"
              @click="open(row as PortfolioAction)"
            >
              {{ row.recordStatus === "PENDING" ? "处理 / 替代" : "原子更正" }}
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="row.recordStatus === 'VOID' || busy"
              @click="voidAction(row as PortfolioAction)"
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
    <ActionDrawer
      v-if="selected"
      v-model="opened"
      :position="selected"
      :original="original"
      @saved="page.load()"
    />
  </section>
</template>
