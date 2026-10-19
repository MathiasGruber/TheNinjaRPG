import { describe, expect, it } from "bun:test";
import { runInNewContext } from "node:vm";
import { GAME_LAYOUT_THEME_SCRIPT, getGameLayoutThemeScript, type GameLayoutThemeId } from "@/libs/layoutThemes";

describe("layout theme before first paint", () => {
  const run = (readStorage: () => string | null, defaultTheme?: GameLayoutThemeId) => {
    const attributes: Record<string, string> = {};
    const classes = new Set<string>();
    runInNewContext(defaultTheme ? getGameLayoutThemeScript(defaultTheme) : GAME_LAYOUT_THEME_SCRIPT, {
      localStorage: { getItem: readStorage },
      document: { documentElement: {
        setAttribute: (name: string, value: string) => { attributes[name] = value; },
        classList: { toggle: (name: string, enabled: boolean) => {
          if (enabled) classes.add(name);
          else classes.delete(name);
        } },
      } },
    });
    return { theme: attributes["data-game-layout"], dark: classes.has("dark") };
  };

  it("restores a dark theme before hydration and clears dark for a light theme", () => {
    expect(run(() => '"17-obsidian-council"')).toEqual({ theme: "17-obsidian-council", dark: true });
    expect(run(() => '"3-sakura-courtyard"')).toEqual({ theme: "3-sakura-courtyard", dark: false });
  });

  it.each([null, '"1-horizon-watch"', "broken JSON", '"unknown-theme"', '{"id":"17-obsidian-council"}'])(
    "uses the default for invalid storage %j", (value) => {
      expect(run(() => value)).toEqual({ theme: "20-eclipse-observatory", dark: true });
    },
  );

  it("uses the site welcome theme only as a fallback for an explicit visitor choice", () => {
    expect(run(() => '"17-obsidian-council"', "3-sakura-courtyard")).toEqual({ theme: "17-obsidian-council", dark: true });
    expect(run(() => { throw new Error("Storage unavailable"); }, "17-obsidian-council")).toEqual({ theme: "17-obsidian-council", dark: true });
  });

  it("restores the configured welcome default when there is no saved choice", () => {
    expect(run(() => null, "3-sakura-courtyard")).toEqual({ theme: "3-sakura-courtyard", dark: false });
  });

  it("still marks a usable theme when browser storage is unavailable", () => {
    expect(run(() => { throw new DOMException("Storage is blocked", "SecurityError"); })).toEqual({ theme: "20-eclipse-observatory", dark: true });
  });
});
