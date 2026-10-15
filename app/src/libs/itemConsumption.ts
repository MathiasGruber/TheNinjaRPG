import { nanoid } from "nanoid";
import {
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
} from "@/hooks/localstorage";

// Memory retains retries when browser storage is unavailable; session storage survives reloads.
const pending = new Map<string, string>();
/** Keep pending openings separate across account switches and inventory stacks. */
const storageKey = (userId: string, userItemId: string) =>
  `tnr:item-consume:${userId}:${userItemId}`;

/** Retain the opening identity through a lost response, dialog closure and page reload. */
export const getItemConsumeRequestId = (userId: string, userItemId: string) => {
  const key = storageKey(userId, userItemId);
  const requestId = pending.get(key) ?? safeSessionStorageGetItem(key) ?? nanoid();
  pending.set(key, requestId);
  safeSessionStorageSetItem(key, requestId);
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
