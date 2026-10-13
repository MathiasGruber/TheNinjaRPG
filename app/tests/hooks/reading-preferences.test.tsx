import { ensureDom } from "../setup-dom.mjs";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { renderToString } from "react-dom/server";
import { ReadingPreferencesProvider, useReadingPreferences } from "@/hooks/useReadingPreferences";
import {
  applyReadingPreferences,
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  READING_ATTRIBUTES,
  READING_OPTIONS,
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

const renderPreferences = () => renderHook(() => useReadingPreferences(), { wrapper: ReadingPreferencesProvider });

const runHeadScript = () => {
  const script = document.createElement("script");
  script.setAttribute("data-storage-key", READING_PREFERENCES_STORAGE_KEY);
  script.setAttribute("data-options", JSON.stringify(READING_OPTIONS));
  script.setAttribute("data-attributes", JSON.stringify(READING_ATTRIBUTES));
  new Function("document", "localStorage", READING_PREFERENCES_SCRIPT)(
    { currentScript: script, documentElement: document.documentElement },
    window.localStorage,
  );
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
    expect(renderToString(<ReadingPreferencesProvider><Probe /></ReadingPreferencesProvider>)).toBe("<span>default</span>");
    const hook = renderPreferences();
    expect(hook.result.current.preferences).toEqual(saved);
    expect(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY)).toBe(serialized);
  });

  it("synchronizes mounted settings and persists a reset", () => {
    const first = renderPreferences();
    const second = renderPreferences();
    act(() => first.result.current.updatePreferences(saved));
    expect(second.result.current.preferences).toEqual(saved);
    expect(parseReadingPreferences(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY))).toEqual(saved);
    act(() => second.result.current.updatePreferences(DEFAULT_READING_PREFERENCES));
    expect(first.result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it("restores defaults when storage is cleared in another tab", () => {
    const hook = renderPreferences();
    act(() => hook.result.current.updatePreferences(saved));
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new window.StorageEvent("storage", { key: null }));
    });
    expect(hook.result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it("keeps inaccessible-storage changes temporary and synchronizes a successful retry", () => {
    const first = renderPreferences();
    const second = renderPreferences();
    const write = spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => {
      throw new Error("Storage is full");
    });
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      act(() => first.result.current.updatePreferences(saved));
      expect(first.result.current.isPersisted).toBe(false);
      expect(second.result.current.isPersisted).toBe(false);
      expect(second.result.current.preferences).toEqual(saved);
      expect(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY)).toBeNull();
    } finally {
      write.mockRestore();
      warn.mockRestore();
    }
    act(() => second.result.current.updatePreferences(saved));
    expect(first.result.current.isPersisted).toBe(true);
    expect(second.result.current.isPersisted).toBe(true);
    expect(parseReadingPreferences(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY))).toEqual(saved);
  });

  it("retains temporary values and retry feedback when a settings panel remounts", () => {
    let current!: ReturnType<typeof useReadingPreferences>;
    const Capture = () => {
      current = useReadingPreferences();
      return null;
    };
    const view = render(<ReadingPreferencesProvider><Capture /></ReadingPreferencesProvider>);
    const write = spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => {
      throw new Error("Storage is full");
    });
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      act(() => current.updatePreferences(saved));
      view.rerender(<ReadingPreferencesProvider><span>Settings closed</span></ReadingPreferencesProvider>);
      view.rerender(<ReadingPreferencesProvider><Capture /></ReadingPreferencesProvider>);
      expect(current.preferences).toEqual(saved);
      expect(current.isPersisted).toBe(false);
    } finally {
      write.mockRestore();
      warn.mockRestore();
    }
    act(() => current.updatePreferences(current.preferences));
    expect(current.isPersisted).toBe(true);
    expect(parseReadingPreferences(window.localStorage.getItem(READING_PREFERENCES_STORAGE_KEY))).toEqual(saved);
  });

  it("applies the same allowlisted attributes before paint and after hydration", () => {
    window.localStorage.setItem(READING_PREFERENCES_STORAGE_KEY, JSON.stringify(saved));
    // Run the literal head script against the DOM, independent of the client helper.
    runHeadScript();
    const before = document.documentElement.outerHTML;
    applyReadingPreferences(saved);
    expect(document.documentElement.outerHTML).toBe(before);
    applyReadingPreferences(DEFAULT_READING_PREFERENCES);
    for (const attribute of Object.values(READING_ATTRIBUTES)) {
      expect(document.documentElement.hasAttribute(attribute)).toBe(false);
    }
    window.localStorage.setItem(READING_PREFERENCES_STORAGE_KEY, '{"font":"invalid","palette":["cream"]}');
    runHeadScript();
    for (const attribute of Object.values(READING_ATTRIBUTES)) {
      expect(document.documentElement.hasAttribute(attribute)).toBe(false);
    }
  });
});
