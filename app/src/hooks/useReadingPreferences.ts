"use client";

import { useCallback, useEffect, useState } from "react";
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/hooks/localstorage";
import {
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  READING_PREFERENCES_STORAGE_KEY,
  type ReadingPreferences,
} from "@/libs/readingPreferences";

export const useReadingPreferences = () => {
  // Keep the first render identical to SSR; the head script already styles the page.
  const [preferences, setPreferences] = useState(DEFAULT_READING_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setPreferences(
      parseReadingPreferences(safeLocalStorageGetItem(READING_PREFERENCES_STORAGE_KEY)),
    );
    setIsLoaded(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === READING_PREFERENCES_STORAGE_KEY || event.key === null) {
        setPreferences(
          parseReadingPreferences(
            safeLocalStorageGetItem(READING_PREFERENCES_STORAGE_KEY),
          ),
        );
      }
    };
    const onSync = (event: Event) => {
      const { key, value } = (event as CustomEvent<{ key: string; value: string }>)
        .detail;
      if (key === READING_PREFERENCES_STORAGE_KEY) {
        setPreferences(parseReadingPreferences(value));
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("localStorageSync", onSync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("localStorageSync", onSync);
    };
  }, []);

  const updatePreferences = useCallback((next: ReadingPreferences) => {
    const serialized = JSON.stringify(next);
    const validated = parseReadingPreferences(serialized);
    setPreferences(validated);
    safeLocalStorageSetItem(READING_PREFERENCES_STORAGE_KEY, serialized);
    window.dispatchEvent(
      new window.CustomEvent("localStorageSync", {
        detail: { key: READING_PREFERENCES_STORAGE_KEY, value: serialized },
      }),
    );
  }, []);

  return { preferences, updatePreferences, isLoaded };
};
