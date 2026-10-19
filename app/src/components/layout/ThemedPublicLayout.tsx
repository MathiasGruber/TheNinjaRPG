"use client";

import { type ReactNode, useEffect } from "react";
import { IMG_LOGO_SHORT } from "@/drizzle/constants";
import { applyGameLayoutTheme, useGameLayoutTheme } from "@/hooks/useGameLayoutTheme";
import Footer from "@/layout/Footer";
import { GameSettingsPopover, GlobalAudioProvider } from "@/layout/GameSettings";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import {
  DEFAULT_GAME_LAYOUT_THEME,
  GAME_LAYOUT_ART_STYLES,
  getWelcomeLayoutTheme,
} from "@/libs/layoutThemes";
import { usePublicPathname } from "@/utils/routing";

export function ThemedPublicLayout({ children }: { children: ReactNode }) {
  const themeId = useGameLayoutTheme(
    getWelcomeLayoutTheme() ?? DEFAULT_GAME_LAYOUT_THEME,
  );
  useEffect(() => applyGameLayoutTheme(themeId), [themeId]);
  return (
    <GlobalAudioProvider>
      <ThemedPublicFrame>{children}</ThemedPublicFrame>
    </GlobalAudioProvider>
  );
}

export function ThemedPublicFrame({ children }: { children: ReactNode }) {
  const pathname = usePublicPathname();
  const isWelcome = pathname === "/";
  const home = "/";
  const links = [
    { name: "World", href: `${home}#world` },
    { name: "Gameplay", href: `${home}#gameplay` },
    { name: "Community", href: `${home}#community` },
    { name: "Guide", href: "/guide" },
  ];
  return (
    <div
      className="theme-public-page"
      data-layout-variant="themed"
      data-welcome-page={isWelcome}
    >
      <style>{GAME_LAYOUT_ART_STYLES}</style>
      <a className="theme-skip-link" href="#welcome-content">
        Skip to content
      </a>
      <header className="theme-public-header">
        <Link href={home} aria-label="The Ninja RPG home" className="theme-public-logo">
          <Image
            src={IMG_LOGO_SHORT}
            alt="The Ninja RPG"
            width={250}
            height={63}
            priority
          />
        </Link>
        <nav className="theme-public-nav" aria-label="Explore The Ninja RPG">
          {links.map((link) => (
            <Link key={link.name} href={link.href}>
              {link.name}
            </Link>
          ))}
        </nav>
        <div className="theme-public-account">
          <Link href="/login" className="welcome-login">
            Log in
          </Link>
          <Link href="/signup" className="welcome-register">
            Register
          </Link>
          <GameSettingsPopover
            trigger="settings"
            triggerClassName="theme-public-settings-button"
            defaultLayoutTheme={getWelcomeLayoutTheme()}
          />
        </div>
      </header>
      <main
        id="welcome-content"
        className={isWelcome ? "theme-public-welcome" : "theme-public-content"}
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="theme-public-footer">
        <Footer />
      </footer>
    </div>
  );
}
