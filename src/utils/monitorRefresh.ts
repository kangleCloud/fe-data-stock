import type { MonitorRefreshResult } from "@/types/refresh";
import { formatShanghaiDateTime } from "@/utils/stockManagement";
import { ApiError } from "@/utils/request";

export function refreshFeedback(result: MonitorRefreshResult): { type: "success" | "warning" | "error"; message: string } {
  // 旧响应可能在拒绝执行时携带上次 SUCCESS，不能将其当成本次完成。
  if ("accepted" in result && result.accepted === false) {
    return { type: "warning", message: `刷新未执行${result.message ? `：${result.message}` : "：已有刷新正在执行"}` };
  }
  const labels: Record<string, string> = { SUCCESS: "刷新成功", PARTIAL: "刷新部分完成", ERROR: "刷新失败",
    FAILED: "刷新失败", LOCKED: "刷新锁冲突，本次未执行", RUNNING: "刷新正在进行", SKIPPED: "刷新未执行",
    IDLE: "尚未刷新", UNCONFIRMED: "刷新结果未确认" };
  return { type: result.status === "SUCCESS" ? "success" : ["ERROR", "FAILED"].includes(result.status) ? "error" : "warning",
    message: `${labels[result.status] ?? `刷新状态 ${result.status}`}${result.message ? `：${result.message}` : ""}` };
}

export function refreshFailure(cause: unknown): MonitorRefreshResult {
  return { status: cause instanceof ApiError && cause.code === 423 ? "LOCKED"
    : cause instanceof ApiError && cause.code !== undefined ? "ERROR" : "UNCONFIRMED",
    startedAt: null, finishedAt: null,
    message: cause instanceof Error ? cause.message : "整体刷新结果未确认" };
}

export function refreshSummary(result: MonitorRefreshResult): string {
  return `${refreshFeedback(result).message} · 开始 ${formatShanghaiDateTime(result.startedAt)} · 完成 ${formatShanghaiDateTime(result.finishedAt)}`;
}
