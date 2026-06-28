export function relativeTimeAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) {
    return "just now";
  }
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  return `${Math.floor(hr / 24)}d ago`;
}

export function relativeTimeShort(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) {
    return "now";
  }
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h`;
  }
  return `${Math.floor(hr / 24)}d`;
}
