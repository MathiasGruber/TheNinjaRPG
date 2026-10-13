import { ensureDom } from "../setup-dom.mjs";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { useReadingPreferences } from "@/hooks/useReadingPreferences";
import {
  applyReadingPreferences,
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  READING_ATTRIBUTES,
  READING_PREFERENCES_SCRIPT,
  READING_PREFERENCES_STORAGE_KEY,
} from "@/libs/readingPreferences";

const saved = {
  font: "atkinson",
  spacing: "wider",
  lineHeight: "spacious",
  palette: "cream",
} as const;

const Probe = () => {
  const { preferences } = useReadingPreferences();
  return <span>{preferences.font}</span>;
};

describe("reading preferences", () => {
  beforeEach(() => {
    ensureDom();
    window.localStorage.clear();
    applyReadingPreferences(DEFAULT_READING_PREFERENCES);
  });
  afterEach(cleanup);

  it("retains valid fields and rejects malformed or unsupported values", () => {
    for (const value of [null, "bad json", "null", "[]", "true"]) {
      expect(parseReadingPreferences(value)).toEqual(DEFAULT_READING_PREFERENCES);
    }
    expect(
      parseReadingPreferences(
        JSON.stringify({ ...saved, font: ["comic"], palette: "unknown" }),
      ),
    ).toEqual({ ...saved, font: "default", palette: "default" });
  });

  it("keeps server markup stable without overwriting saved settings on mount", () => {
    const serialized = JSON.stringify(saved);
    window.localStorage.setItem(READING_PREFERENCES_STORAGE_KEY, serialized);
    expect(renderToString(<Probe />)).toBe("<span>default</span>");
    const hook = renderHook(() => useReadingPreferences());
    expect(hook.result.current.preferences).toEqual(saved);
    expect(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY)).toBe(serialized);
  });

  it("synchronizes mounted settings and persists a reset", () => {
    const first = renderHook(() => useReadingPreferences());
    const second = renderHook(() => useReadingPreferences());
    act(() => first.result.current.updatePreferences(saved));
    expect(second.result.current.preferences).toEqual(saved);
    expect(parseReadingPreferences(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY))).toEqual(saved);
    act(() => second.result.current.updatePreferences(DEFAULT_READING_PREFERENCES));
    expect(first.result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it("restores defaults when storage is cleared in another tab", () => {
    const hook = renderHook(() => useReadingPreferences());
    act(() => hook.result.current.updatePreferences(saved));
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new window.StorageEvent("storage", { key: null }));
    });
    expect(hook.result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it("applies the same allowlisted attributes before paint and after hydration", () => {
    window.localStorage.setItem(READING_PREFERENCES_STORAGE_KEY, JSON.stringify(saved));
    // Run the literal head script against the DOM, independent of the client helper.
    new Function("document", "localStorage", READING_PREFERENCES_SCRIPT)(document, window.localStorage);
    const before = document.documentElement.outerHTML;
    applyReadingPreferences(saved);
    expect(document.documentElement.outerHTML).toBe(before);
    applyReadingPreferences(DEFAULT_READING_PREFERENCES);
    for (const attribute of Object.values(READING_ATTRIBUTES)) {
      expect(document.documentElement.hasAttribute(attribute)).toBe(false);
    }
    window.localStorage.setItem(READING_PREFERENCES_STORAGE_KEY, '{"font":"invalid","palette":["cream"]}');
    new Function("document", "localStorage", READING_PREFERENCES_SCRIPT)(document, window.localStorage);
    for (const attribute of Object.values(READING_ATTRIBUTES)) {
      expect(document.documentElement.hasAttribute(attribute)).toBe(false);
    }
  });
});
