import { nanoid } from "nanoid";

const pending = new Map<string, string>();
const storageKey = (userId: string, userItemId: string) =>
  `tnr:item-consume:${userId}:${userItemId}`;

/** Retain the opening identity through a lost response, dialog closure and page reload. */
export const getItemConsumeRequestId = (userId: string, userItemId: string) => {
  const key = storageKey(userId, userItemId);
  let requestId = pending.get(key);
  try {
    requestId ??= sessionStorage.getItem(key) ?? undefined;
  } catch {
    // Private/storage-restricted clients still retain the identity for this page's lifetime.
  }
  requestId ??= nanoid();
  pending.set(key, requestId);
  try {
    sessionStorage.setItem(key, requestId);
  } catch {
    // The in-memory fallback above remains available when browser storage is disabled.
  }
  return requestId;
};

/** A server response, including an expected rejection, definitively settles this attempt. */
export const finishItemConsumeRequest = (userId: string, userItemId: string) => {
  const key = storageKey(userId, userItemId);
  pending.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage availability does not affect the authoritative server receipt.
  }
};
