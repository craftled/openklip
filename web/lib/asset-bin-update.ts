export type AssetKind = "broll" | "music" | "still";

export interface AssetBinUpdate {
  assets: Array<{
    durationSamples: number;
    id: string;
    kind: AssetKind;
    name: string;
    proxy: string;
  }>;
  broll?: Array<{
    assetId: string;
    endSample: number;
    id: string;
    srcInSample: number;
    startSample: number;
  }>;
  stills?: Array<{
    assetId: string;
    endSample: number;
    focusX: number;
    focusY: number;
    id: string;
    scale: number;
    startSample: number;
  }>;
}

export async function deleteAssetApi(
  slug: string,
  assetId: string
): Promise<AssetBinUpdate | { ok: false; error: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(slug)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE" }
  );
  const data = (await res.json()) as AssetBinUpdate & { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error ?? `Delete failed (${res.status})` };
  }
  return {
    assets: data.assets.map((a) => ({
      ...a,
      kind: (a.kind ?? "broll") as AssetKind,
    })),
    broll: data.broll,
    stills: data.stills,
  };
}
