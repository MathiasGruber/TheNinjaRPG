"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/hooks/localstorage";
import {
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  READING_PREFERENCES_STORAGE_KEY,
  type ReadingPreferences,
} from "@/libs/readingPreferences";

/** Keeps temporary preferences and save feedback available when settings panels remount. */
export const ReadingPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const value = useStoredReadingPreferences();
  return (
    <ReadingPreferencesContext value={value}>{children}</ReadingPreferencesContext>
  );
};

export const useReadingPreferences = () => {
  const value = use(ReadingPreferencesContext);
  if (!value) {
    throw new Error("useReadingPreferences requires ReadingPreferencesProvider");
  }
  return value;
};

const ReadingPreferencesContext = createContext<ReturnType<
  typeof useStoredReadingPreferences
> | null>(null);

const useStoredReadingPreferences = () => {
  // Keep the first render identical to SSR; the head script already styles the page.
  const [preferences, setPreferences] = useState(DEFAULT_READING_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPersisted, setIsPersisted] = useState(true);

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
        setIsPersisted(true);
      }
    };
    const onSync = (event: Event) => {
      const {
        key,
        value,
        isPersisted: saved,
      } = (event as CustomEvent<{ key: string; value: string; isPersisted?: boolean }>)
        .detail;
      if (key === READING_PREFERENCES_STORAGE_KEY) {
        setPreferences(parseReadingPreferences(value));
        setIsPersisted(saved !== false);
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
    const saved = safeLocalStorageSetItem(READING_PREFERENCES_STORAGE_KEY, serialized);
    setPreferences(validated);
    setIsPersisted(saved);
    window.dispatchEvent(
      new window.CustomEvent("localStorageSync", {
        detail: {
          key: READING_PREFERENCES_STORAGE_KEY,
          value: serialized,
          isPersisted: saved,
        },
      }),
    );
  }, []);

  return { preferences, updatePreferences, isLoaded, isPersisted };
};
