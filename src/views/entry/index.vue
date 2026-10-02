<script setup lang="ts">
import { ArrowRight, DataAnalysis, Lock, TrendCharts } from "@element-plus/icons-vue";
</script>

<template>
  <div class="home-page">
    <a class="home-skip" href="#home-main">跳到主要内容</a>
    <header class="home-header">
      <RouterLink class="home-brand" to="/" aria-label="Vita Stock 首页">
        <span class="home-brand__mark"><TrendCharts /></span>
        <span>Vita Stock</span>
      </RouterLink>
      <nav class="home-nav" aria-label="主导航">
        <RouterLink to="/market/overview">资金板块总览</RouterLink>
        <RouterLink to="/market/stock-monitor">个股监控</RouterLink>
        <RouterLink to="/login">管理端登录</RouterLink>
      </nav>
    </header>

    <main id="home-main" class="home-main">
      <div class="home-intro">
        <p class="home-eyebrow">SECURITIES DATA PLATFORM</p>
        <h1>看清板块资金，<br />从数据开始。</h1>
        <p class="home-lead">公开查看同花顺板块榜单、大盘资金流向和个股监控清单。每个页面分别标注数据日期与采集状态，便于判断信息的时效性。</p>
      </div>

      <div class="home-options" aria-label="选择入口">
        <RouterLink class="home-option home-option--market" to="/market/overview">
          <span class="home-option__icon"><DataAnalysis /></span>
          <span class="home-option__copy">
            <small>公开查看</small>
            <strong>资金板块总览</strong>
            <span>查看行业、概念板块 Top 10 与大盘资金流。无需登录。</span>
          </span>
          <ArrowRight class="home-option__arrow" />
        </RouterLink>

        <RouterLink class="home-option home-option--stock" to="/market/stock-monitor">
          <span class="home-option__icon"><TrendCharts /></span>
          <span class="home-option__copy">
            <small>公开查看</small>
            <strong>个股监控</strong>
            <span>查看最多 10 只股票的价格采样、涨跌幅与成交额。采集关闭时明确显示状态。</span>
          </span>
          <ArrowRight class="home-option__arrow" />
        </RouterLink>

        <RouterLink class="home-option home-option--admin" to="/login">
          <span class="home-option__icon"><Lock /></span>
          <span class="home-option__copy">
            <small>账户访问</small>
            <strong>进入管理端</strong>
            <span>登录后使用账户权限范围内的管理功能。</span>
          </span>
          <ArrowRight class="home-option__arrow" />
        </RouterLink>
      </div>

      <p class="home-footnote">页面展示最近可用数据；具体日期、源时间与状态以对应模块标注为准。</p>
    </main>
  </div>
</template>

<style scoped>
.home-page { min-height: 100vh; color: #f4f7fb; background: linear-gradient(145deg, #071426 0%, #0c1f38 56%, #102c4b 100%); }
.home-skip { position: absolute; left: 12px; top: -64px; z-index: 10; padding: 10px 14px; color: #fff; background: #1e40af; border-radius: 8px; }
.home-skip:focus { top: 12px; }
.home-header { width: min(1200px, calc(100% - 48px)); min-height: 82px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid rgb(167 179 197 / 20%); }
.home-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 750; letter-spacing: .01em; }
.home-brand__mark { width: 34px; height: 34px; display: grid; place-items: center; padding: 7px; color: #fff; border-radius: 9px; background: #2563eb; }
.home-brand__mark svg { width: 100%; height: 100%; }
.home-nav { display: flex; align-items: center; gap: 20px; color: #c4d0e1; font-size: 13px; }
.home-nav a { min-height: 44px; display: inline-flex; align-items: center; transition: color 180ms ease; }
.home-nav a:hover { color: #fff; }
.home-main { width: min(1200px, calc(100% - 48px)); margin: auto; padding: clamp(64px, 10vw, 128px) 0 48px; }
.home-intro { max-width: 770px; }
.home-eyebrow { margin: 0 0 16px; color: #93c5fd; font-size: 12px; font-weight: 750; letter-spacing: .12em; }
.home-intro h1 { margin: 0; font-size: clamp(38px, 6vw, 72px); line-height: 1.14; letter-spacing: -.035em; }
.home-lead { max-width: 650px; margin: 24px 0 0; color: #bdcadb; font-size: clamp(14px, 1.4vw, 16px); line-height: 1.85; }
.home-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: clamp(40px, 6vw, 72px); }
.home-option { min-width: 0; min-height: 192px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 22px; align-items: start; gap: 16px; padding: 28px; border: 1px solid #36506c; border-radius: 14px; background: #10233b; transition: border-color 180ms ease, background 180ms ease; }
.home-option:hover { border-color: #7ab5f6; background: #162d49; }
.home-option--market, .home-option--stock { border-color: #4b80bb; background: #123154; }
.home-option__icon { width: 44px; height: 44px; display: grid; place-items: center; padding: 11px; border-radius: 10px; color: #bfdbfe; background: rgb(59 130 246 / 20%); }
.home-option__icon svg { width: 100%; height: 100%; }
.home-option__copy { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.home-option__copy small { color: #a8cfff; font-size: 12px; }
.home-option__copy strong { font-size: 22px; line-height: 1.3; }
.home-option__copy > span { color: #c0cede; font-size: 13px; line-height: 1.65; }
.home-option__arrow { width: 20px; height: 20px; margin-top: 11px; color: #c8d7eb; }
.home-footnote { margin: 24px 0 0; color: #9fb0c5; font-size: 12px; }
@media (max-width: 1000px) { .home-options { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .home-header, .home-main { width: min(100% - 32px, 560px); }
  .home-header { min-height: 72px; }
  .home-nav { gap: 10px; font-size: 12px; }
  .home-main { padding-top: 68px; }
  .home-options { grid-template-columns: 1fr; }
  .home-option { min-height: 154px; padding: 22px; }
}
@media (max-width: 410px) {
  .home-brand { font-size: 14px; }
  .home-nav { gap: 7px; }
  .home-nav a:first-child { display: none; }
  .home-option { grid-template-columns: 40px minmax(0, 1fr) 18px; gap: 11px; }
  .home-option__copy strong { font-size: 19px; }
}
</style>
