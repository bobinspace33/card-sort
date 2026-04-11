/** Public URL for students (no facilitator dashboard). */
export function getPublicPlayUrl(activityId: string): string {
  if (typeof window === 'undefined') return `/play/${activityId}`;
  return `${window.location.origin}/play/${activityId}`;
}

/** Facilitator preview / same activity path as before. */
export function getFacilitatorActivityUrl(activityId: string): string {
  if (typeof window === 'undefined') return `/activity/${activityId}`;
  return `${window.location.origin}/activity/${activityId}`;
}
