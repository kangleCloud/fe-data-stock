<script setup lang="ts">
import type { BrokerReference } from "@/types/portfolio";
import { feeSourceNames, formatMoney } from "@/utils/portfolio";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
defineProps<{ reference: BrokerReference }>();
</script>
<template>
  <section class="portfolio-preview">
    <header class="portfolio-header">
      <h3>券商摊薄口径测算 / 对账</h3>
      <PortfolioTips
        content="摊薄口径可能包含此前卖出收益，不等于本笔实际利润。测算单独展示，不累加入账本已实现收益。反推仅为费用合计预估，不拆分佣金税费。需券商成本口径一致、期间无其他变动，并考虑展示舍入误差；手动修正后仍是预估，实际费用与实际结算不再叠加。"
      />
    </header>
    <p v-if="reference.message" class="portfolio-muted">
      {{ reference.message }}
    </p>
    <el-descriptions :column="2" border>
      <el-descriptions-item label="操作前 / 本次卖出 / 操作后数量">
        {{ reference.quantityBefore }} / {{ reference.quantitySold }} /
        {{ reference.quantityRemaining }}
      </el-descriptions-item>
      <el-descriptions-item label="最终采用费用">
        {{ formatMoney(reference.feeApplied) }} 元 ·
        {{
          feeSourceNames[reference.feeSource || ""] ||
            (reference.feeApplied == null ? "费用待补" : "来源未提供")
        }}
      </el-descriptions-item>
      <el-descriptions-item label="操作前券商持仓成本价">
        {{ formatMoney(reference.costBefore) }}
      </el-descriptions-item>
      <el-descriptions-item label="操作后券商持仓成本价">
        {{ formatMoney(reference.costAfter) }}
      </el-descriptions-item>
      <template
        v-if="
          reference.referenceType === 'BUY' ||
            reference.referenceType === 'PARTIAL'
        "
      >
        <el-descriptions-item label="原始反推费用（预估合计）">
          {{ formatMoney(reference.inferredFee) }}
        </el-descriptions-item>
        <el-descriptions-item
          v-if="reference.referenceType === 'PARTIAL'"
          label="摊薄口径参考收益"
        >
          {{ formatMoney(reference.referencePnl) }}
        </el-descriptions-item>
      </template>
      <template v-else-if="reference.referenceType === 'CLOSING'">
        <el-descriptions-item label="清仓参考毛收益">
          {{ formatMoney(reference.referenceGrossPnl) }}
        </el-descriptions-item>
        <el-descriptions-item label="清仓参考净收益">
          {{ formatMoney(reference.referenceNetPnl) }}
        </el-descriptions-item>
      </template>
      <el-descriptions-item
        v-if="reference.feeAdjustment != null"
        label="采用费用与反推值差额"
      >
        {{ formatMoney(reference.feeAdjustment) }} 元
      </el-descriptions-item>
    </el-descriptions>
    <p v-if="reference.referenceType === 'OBSERVATION'" class="portfolio-muted">
      仅记录券商观察，未具备反推条件，不生成费用或参考盈亏。
    </p>
    <el-alert
      v-if="reference.inferredFee?.startsWith('-')"
      type="warning"
      title="反推差额为负，仅供观察，不能采纳为费用；请核对券商记录或补录实际费用"
      :closable="false"
    />
    <details v-if="reference.referenceType !== 'OBSERVATION'">
      <summary>查看公式与本次代入值</summary>
      <template v-if="reference.referenceType === 'BUY'">
        <p>买入反推费用 = 操作后券商成本总额 − 操作前券商成本总额 − 成交金额</p>
        <p>
          {{ formatMoney(reference.costAfterTotal) }} −
          {{ formatMoney(reference.costBeforeTotal) }} −
          {{ formatMoney(reference.grossAmount) }} =
          {{ formatMoney(reference.inferredFee) }}
        </p>
      </template>
      <template v-else-if="reference.referenceType === 'PARTIAL'">
        <p>摊薄口径参考收益 =（卖前成本价 − 卖后成本价）× 剩余数量</p>
        <p>
          （{{ formatMoney(reference.costBefore) }} −
          {{ formatMoney(reference.costAfter) }}）×
          {{ reference.quantityRemaining }} =
          {{ formatMoney(reference.referencePnl) }}
        </p>
        <p>反推手续费 = 成交金额 + 卖后成本总额 − 卖前成本总额</p>
        <p>
          {{ formatMoney(reference.grossAmount) }} +
          {{ formatMoney(reference.costAfterTotal) }} −
          {{ formatMoney(reference.costBeforeTotal) }} =
          {{ formatMoney(reference.inferredFee) }}
        </p>
      </template>
      <template v-else-if="reference.referenceType === 'CLOSING'">
        <p>清仓参考毛收益 =（卖出价 − 操作前券商持仓成本价）× 卖出数量</p>
        <p>
          （{{ formatMoney(reference.sellPrice) }} −
          {{ formatMoney(reference.costBefore) }}）×
          {{ reference.quantitySold }} =
          {{ formatMoney(reference.referenceGrossPnl) }}
        </p>
        <p>
          参考净收益 = 参考毛收益 − 采用费用 =
          {{ formatMoney(reference.referenceNetPnl) }}
        </p>
      </template>
    </details>
  </section>
</template>
