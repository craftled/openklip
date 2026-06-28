import { type BinAsset, withAssetKind } from "@/components/asset-bin";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";

async function readJsonResponse(
  res: Response
): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      res.ok
        ? "Server returned an invalid response"
        : `Request failed (${res.status})${snippet ? `: ${snippet}` : ""}`
    );
  }
}

function parseSyncResponse(
  res: Response,
  data: Record<string, unknown>
): AssetBinUpdate | null {
  if (!(res.ok && Array.isArray(data.assets))) {
    return null;
  }
  return {
    assets: (data.assets as BinAsset[]).map(withAssetKind),
    broll: Array.isArray(data.broll)
      ? (data.broll as AssetBinUpdate["broll"])
      : undefined,
    stills: Array.isArray(data.stills)
      ? (data.stills as AssetBinUpdate["stills"])
      : undefined,
  };
}

export async function syncProjectAssets(
  slug: string
): Promise<AssetBinUpdate | null> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(slug)}/assets/sync`,
    { method: "POST" }
  );
  const data = await readJsonResponse(res);
  return parseSyncResponse(res, data);
}

export async function uploadProjectAssets(
  slug: string,
  files: FileList | File[]
): Promise<BinAsset[]> {
  const list = [...files];
  if (list.length === 0) {
    return [];
  }

  let latest: BinAsset[] = [];
  for (const file of list) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `/api/projects/${encodeURIComponent(slug)}/assets`,
      { method: "POST", body: fd }
    );
    const data = (await readJsonResponse(res)) as {
      assets?: BinAsset[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? `Upload failed (${res.status})`);
    }
    if (data.assets) {
      latest = data.assets.map(withAssetKind);
    }
  }
  return latest;
}
