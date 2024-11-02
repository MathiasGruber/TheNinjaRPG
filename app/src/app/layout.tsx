import { MultisessionAppSupport } from "@clerk/nextjs/internal";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleTagManager } from "@next/third-parties/google";
import { UserContextProvider } from "@/utils/UserContext";
import { Toaster } from "@/components/ui/toaster";
import { env } from "@/env/client.mjs";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "@/app/api/uploadthing/core";
import TrpcClientProvider from "@/app/_trpc/Provider";
import LayoutCore4 from "@/components/layout/core4_default";
import type { Viewport, Metadata } from "next";

import "@uploadthing/react/styles.css";
import "../styles/app_globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NextSSRPlugin
          /** https://docs.uploadthing.com/getting-started/appdir */
          routerConfig={extractRouterConfig(ourFileRouter)}
        />
        <ClerkProvider
          dynamic
          appearance={{
            variables: {
              colorPrimary: "#ce7e00",
              colorText: "black",
            },
          }}
        >
          <MultisessionAppSupport>
            <TrpcClientProvider>
              <UserContextProvider>
                {env.NEXT_PUBLIC_MEASUREMENT_ID && (
                  <GoogleTagManager gtmId={env.NEXT_PUBLIC_MEASUREMENT_ID} />
                )}
                <Toaster />
                <LayoutCore4>{children}</LayoutCore4>
              </UserContextProvider>
            </TrpcClientProvider>
          </MultisessionAppSupport>
        </ClerkProvider>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  title: "TheNinja-RPG.com - a free browser based mmorpg",
  description:
    "A free browser based game set in the ninja world of the Seichi. A multiplayer game with 2D travel and combat system",
  keywords: [
    "mmorpg",
    "online",
    "rpg",
    "game",
    "anime",
    "manga",
    "strategy",
    "multiplayer",
    "ninja",
    "community",
    "core 3",
    "core 4",
    "theninja-rpg",
  ],
  authors: [
    { name: "Mathias F. Gruber", url: "https://github.com/MathiasGruber/TheNinjaRPG" },
  ],
  creator: "Mathias F. Gruber",
  publisher: "Studie-Tech ApS",
  openGraph: {
    title: "TheNinja-RPG",
    description:
      "A free browser based game set in the ninja world of the Seichi. A multiplayer game with 2D travel and combat system",
    url: "https://www.theninja-rpg.com",
    siteName: "TheNinja-RPG",
    images: [
      {
        url: "https://www.theninja-rpg.com/api/og?imageid=", // Must be an absolute URL
        width: 512,
        height: 768,
        alt: "AI generated image",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Ninja-RPG.com - a free browser based mmorpg",
    description:
      "A free browser based game set in the ninja world of the Seichi. A multiplayer game with 2D travel and combat system",
    siteId: "137431404",
    creator: "@nextjs",
    creatorId: "137431404",
    images: ["https://nextjs.org/og.png"], // Must be an absolute URL
  },
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    googleSiteVerification: "0yl4KCd6udl9DAo_TMf8esN6snWH0_gqwf2EShlogRU",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
