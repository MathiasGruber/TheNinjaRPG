"use client";

import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { IMG_LOGO_SHORT } from "@/drizzle/constants";
import { applyGameLayoutTheme } from "@/hooks/useGameLayoutTheme";
import Footer from "@/layout/Footer";
import { GlobalAudioProvider } from "@/layout/GameSettings";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import {
  DEFAULT_GAME_LAYOUT_THEME,
  GAME_LAYOUT_ART_STYLES,
  getWelcomeLayoutTheme,
} from "@/libs/layoutThemes";
import { usePublicPathname } from "@/utils/routing";
import { useUserData } from "@/utils/UserContext";

export function ThemedPublicLayout({ children }: { children: ReactNode }) {
  const themeId = getWelcomeLayoutTheme() ?? DEFAULT_GAME_LAYOUT_THEME;
  const { data: userData } = useUserData();
  useEffect(() => applyGameLayoutTheme(themeId), [themeId]);
  return (
    <GlobalAudioProvider userData={userData}>
      <ThemedPublicFrame>{children}</ThemedPublicFrame>
    </GlobalAudioProvider>
  );
}

export function ThemedPublicFrame({ children }: { children: ReactNode }) {
  const pathname = usePublicPathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isWelcome = pathname === "/";
  const home = "/";
  const links = [
    { name: "World", href: `${home}#world` },
    { name: "Gameplay", href: `${home}#gameplay` },
    { name: "Community", href: `${home}#community` },
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
            <a key={link.name} href={link.href}>
              {link.name}
            </a>
          ))}
        </nav>
        <div className="theme-public-account">
          <Link href="/login" className="welcome-login">
            Log in
          </Link>
          <Link href="/signup" className="welcome-register">
            Start playing
          </Link>
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger
              className="theme-public-menu-button"
              aria-label="Open site menu"
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent className="theme-drawer">
              <SheetHeader>
                <SheetTitle>Explore Seichi</SheetTitle>
              </SheetHeader>
              <nav
                className="theme-public-drawer-nav"
                aria-label="Welcome page navigation"
              >
                {links.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.name}
                  </a>
                ))}
                <Link href="/guide">Game guide</Link>
              </nav>
            </SheetContent>
          </Sheet>
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
