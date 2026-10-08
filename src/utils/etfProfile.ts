import type { EtfProfile } from "@/types/etf";

export function etfProfileSource(source: string | null | undefined): string {
  if (source === "THS") return "同花顺";
  if (source === "LEGACY_EXCHANGE") return "历史交易所资料";
  return source ? "历史资料" : "—";
}

export function etfProfileStatus(profile: Pick<EtfProfile, "source" | "updatedAt">): string {
  if (!profile.updatedAt || Number.isNaN(Date.parse(profile.updatedAt))) return "资料缺失";
  return profile.source === "THS" ? "同花顺同步 · 非实时" : "历史同步 · 非实时";
}
