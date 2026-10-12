/** A real record grows gradually; a bulk `updatedAt` write makes every account look online at once. */
export const ONLINE_RECORD_MAX_GROWTH = 2;
/** Lets a small or freshly reset record grow past the multiplier. */
export const ONLINE_RECORD_MIN_HEADROOM = 100;

/** Whether `onlineNow` should replace the stored max-online record. */
export const isNewOnlineRecord = (previousMax: number, onlineNow: number) =>
  onlineNow > previousMax &&
  onlineNow <=
    Math.max(
      previousMax * ONLINE_RECORD_MAX_GROWTH,
      previousMax + ONLINE_RECORD_MIN_HEADROOM,
    );
