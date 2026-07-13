export function validateCamOverrideSpan(
  fromSec: string,
  toSec: string
): string | null {
  const from = Number(fromSec);
  const to = Number(toSec);
  if (!(Number.isFinite(from) && Number.isFinite(to))) {
    return "Enter valid start and end times in seconds.";
  }
  if (from < 0) {
    return "Start time cannot be negative.";
  }
  if (to <= from) {
    return "End time must be after start time.";
  }
  return null;
}
