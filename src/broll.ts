import { registerAsset } from "./assets.ts";
import type { Asset } from "./edl.ts";

/** @deprecated Use registerAsset(slug, file, "broll") */
export function registerBroll(slug: string, fileArg: string): Promise<Asset> {
  return registerAsset(slug, fileArg, "broll");
}
