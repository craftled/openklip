import type { ExportVerificationReport } from "@engine/export-verification-report";
import type { VerifyReport } from "@engine/verify";

export interface VerifyResponse {
  dashboard: ExportVerificationReport;
  ok: true;
  report: VerifyReport;
  verdict: string;
}

export async function fetchVerifyCut(slug: string): Promise<VerifyResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/verify`);
  const data = (await res.json()) as Partial<VerifyResponse> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "Verify failed");
  }
  if (
    !(data.ok && data.report && data.dashboard) ||
    typeof data.verdict !== "string"
  ) {
    throw new Error("Invalid verify response");
  }
  return data as VerifyResponse;
}
