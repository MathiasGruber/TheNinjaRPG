import { IMG_LAYOUT_THEME_ART } from "@/drizzle/constants";
import { bunnyImageUrl } from "@/utils/image";

/** Layout art and interaction intent; every theme uses the complete shared game controller. */
export const GAME_LAYOUT_THEMES = [
  {
    id: "20-eclipse-observatory",
    name: "Eclipse Observatory",
    audience: "Endgame players and collectors of unusual aesthetics",
    rationale:
      "An orbital navigation frame and compact character column keep progression screens readable. Engraved curves and controlled violet contrast carry the celestial character without taking space from the game.",
    composition:
      "Compact header above the character and content columns, orbital navigation beside the character panel and a full-height world rail on the right.",
    tone: "dark",
    visualLanguage: "Celestial engraving",
    welcomeTitle: "There is always another horizon.",
    welcomeIntro:
      "Discover another technique, another challenge, another possibility. Build a shinobi whose story is still unfolding in a world shared with other players.",
  },
  {
    id: "17-obsidian-council",
    name: "Obsidian Council",
    audience: "Kage, clan leaders and experienced strategists",
    rationale:
      "The council-room composition favors deliberate decision making. A restrained brass accent and low banner leave room for management screens; world systems occupy a prominent left rail and character information sits to the right.",
    composition:
      "Understated council masthead, left world directory, wide decision surface, right personal dossier, navigation aligned to content.",
    tone: "dark",
    visualLanguage: "Lacquer and brass",
    welcomeTitle: "The next era needs its leaders.",
    welcomeIntro:
      "Join a village, build lasting alliances, and grow into the decisions that shape a community. Your journey can lead from the academy to something much larger.",
  },
  {
    id: "3-sakura-courtyard",
    name: "Sakura Courtyard",
    audience: "Social players and long-session readers",
    rationale:
      "A botanical editorial treatment gives the community a peaceful home. A generous reading column and softer lavender hierarchy support forum posts, inbox conversations and quest dialogue.",
    composition:
      "Horizontal top navigation, a slim character folio, a wide reading column and a slender world rail.",
    tone: "light",
    visualLanguage: "Botanical editorial",
    welcomeTitle: "Find your place among the shinobi.",
    welcomeIntro:
      "Some journeys are remembered for their battles. Others, for the people along the way. Make friends, join a village, and write a character story of your own.",
  },
] as const;

export type GameLayoutTheme = (typeof GAME_LAYOUT_THEMES)[number];
export type GameLayoutThemeId = GameLayoutTheme["id"];
export const DEFAULT_GAME_LAYOUT_THEME: GameLayoutThemeId = "20-eclipse-observatory";
export const GAME_LAYOUT_THEME_STORAGE_KEY = "tnr_game_layout_theme";
export const GAME_LAYOUT_THEME_ATTRIBUTE = "data-game-layout";

export const toGameLayoutThemeId = (value: unknown): GameLayoutThemeId | undefined =>
  GAME_LAYOUT_THEMES.find((theme) => theme.id === value)?.id;

export const getGameLayoutTheme = (id: unknown): GameLayoutTheme =>
  GAME_LAYOUT_THEMES.find((theme) => theme.id === id) ?? GAME_LAYOUT_THEMES[0];

export const getGameLayoutArt = (id: GameLayoutThemeId) => IMG_LAYOUT_THEME_ART[id];

export const GAME_LAYOUT_ART_STYLES = GAME_LAYOUT_THEMES.map(
  (theme) =>
    `html[data-game-layout="${theme.id}"]{--theme-art:url("${bunnyImageUrl(getGameLayoutArt(theme.id), 1536)}");--theme-art-mobile:url("${bunnyImageUrl(getGameLayoutArt(theme.id), 720)}")}`,
).join("");

/** Welcome default for visitors without a saved choice. Unset keeps Classic. */
export const getWelcomeLayoutTheme = (
  value: unknown = process.env.NEXT_PUBLIC_WELCOME_LAYOUT_THEME,
): GameLayoutThemeId | undefined => toGameLayoutThemeId(value);

/** A saved choice takes precedence over the public shell's configured default. */
export const getGameLayoutThemeScript = (
  defaultTheme: GameLayoutThemeId = DEFAULT_GAME_LAYOUT_THEME,
) => {
  const ids = JSON.stringify(GAME_LAYOUT_THEMES.map((theme) => theme.id));
  const darkIds = JSON.stringify(
    GAME_LAYOUT_THEMES.filter((theme) => theme.tone === "dark").map(
      (theme) => theme.id,
    ),
  );
  const readPreference = `try{var stored=JSON.parse(localStorage.getItem("${GAME_LAYOUT_THEME_STORAGE_KEY}")||"null");if(${ids}.indexOf(stored)>=0)id=stored}catch(e){}`;
  return `(function(){var id="${defaultTheme}";${readPreference}document.documentElement.setAttribute("${GAME_LAYOUT_THEME_ATTRIBUTE}",id);document.documentElement.classList.toggle("dark",${darkIds}.indexOf(id)>=0)})()`;
};

export const GAME_LAYOUT_THEME_SCRIPT = getGameLayoutThemeScript();
