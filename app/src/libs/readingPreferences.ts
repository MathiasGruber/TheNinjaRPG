export const READING_PREFERENCES_STORAGE_KEY = "tnr_reading_preferences";

export const READING_OPTIONS = {
  font: [
    { value: "default", label: "Game default" },
    { value: "atkinson", label: "Atkinson Hyperlegible" },
    { value: "sans", label: "Helvetica / Arial" },
    { value: "comic", label: "Comic Sans" },
  ],
  spacing: [
    { value: "default", label: "Game default" },
    { value: "wide", label: "Wide" },
    { value: "wider", label: "Extra wide" },
  ],
  lineHeight: [
    { value: "default", label: "Game default" },
    { value: "relaxed", label: "Relaxed (1.75)" },
    { value: "spacious", label: "Spacious (2)" },
  ],
  palette: [
    { value: "default", label: "Game default" },
    { value: "cream", label: "Cream" },
    { value: "grey", label: "Light grey" },
    { value: "yellow", label: "Pale yellow" },
  ],
} as const;

export type ReadingPreferences = {
  [Key in keyof typeof READING_OPTIONS]: (typeof READING_OPTIONS)[Key][number]["value"];
};

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  font: "default",
  spacing: "default",
  lineHeight: "default",
  palette: "default",
};

export const READING_ATTRIBUTES = {
  font: "data-reading-font",
  spacing: "data-reading-spacing",
  lineHeight: "data-reading-line-height",
  palette: "data-reading-palette",
} as const;

export const parseReadingPreferences = (stored: string | null): ReadingPreferences => {
  const preferences = { ...DEFAULT_READING_PREFERENCES };
  try {
    const parsed: unknown = JSON.parse(stored ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return preferences;
    }
    for (const key of Object.keys(READING_OPTIONS) as (keyof ReadingPreferences)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (READING_OPTIONS[key].some((option) => option.value === value)) {
        Object.assign(preferences, { [key]: value });
      }
    }
  } catch {
    // Malformed browser preferences fall back to the game defaults.
  }
  return preferences;
};

export const applyReadingPreferences = (preferences: ReadingPreferences) => {
  for (const key of Object.keys(READING_ATTRIBUTES) as (keyof ReadingPreferences)[]) {
    if (preferences[key] === "default") {
      document.documentElement.removeAttribute(READING_ATTRIBUTES[key]);
    } else {
      document.documentElement.setAttribute(READING_ATTRIBUTES[key], preferences[key]);
    }
  }
};

// Apply only allowlisted values before first paint, avoiding a typography reflow during
// hydration. The client hook restores these attributes when the shell remounts.
export const READING_PREFERENCES_SCRIPT = `(function(){try{var s=document.currentScript;var p=JSON.parse(localStorage.getItem(s.getAttribute("data-storage-key")));if(!p||typeof p!=="object"||Array.isArray(p))return;var o=JSON.parse(s.getAttribute("data-options")),a=JSON.parse(s.getAttribute("data-attributes"));Object.keys(a).forEach(function(k){if(p[k]!=="default"&&o[k].some(function(v){return v.value===p[k]}))document.documentElement.setAttribute(a[k],p[k])})}catch(e){}})()`;
