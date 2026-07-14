/** True when this deployment should serve openklip.com marketing, not the local editor. */
export function isMarketingSite(): boolean {
  return process.env.OPENKLIP_SITE === "marketing";
}
