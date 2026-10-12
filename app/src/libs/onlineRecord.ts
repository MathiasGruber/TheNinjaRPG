/** Maximum additional online users accepted per record update to reject bulk activity spikes. */
export const ONLINE_RECORD_MAX_INCREASE = 50;

/** Whether `onlineNow` should replace the stored max-online record. */
export const isNewOnlineRecord = (previousMax: number, onlineNow: number) =>
  onlineNow > previousMax && onlineNow <= previousMax + ONLINE_RECORD_MAX_INCREASE;
