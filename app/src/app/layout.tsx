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
import { IMG_LOGO_FULL } from "@/drizzle/constants";
import type { Viewport, Metadata } from "next";

import "../styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NextSSRPlugin
          /** https://docs.uploadthing.com/getting-started/appdir */
          routerConfig={extractRouterConfig(ourFileRouter)}
        />
        <ClerkProvider
          telemetry={false}
          publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
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

// Reused variables
const title = "TheNinja-RPG - Online RPG - Free Online Game for Ninjas";
const description =
  "A free browser game with ninja set in the world of Seichi. A free online game";

// Metadata
export const metadata: Metadata = {
  title: title,
  description: description,
  keywords: [
    "anime",
    "community",
    "core 3",
    "core 4",
    "free",
    "game",
    "manga",
    "mmorpg",
    "multiplayer",
    "naruto",
    "ninja",
    "online",
    "rpg",
    "strategy",
    "theninja-rpg",
  ],
  authors: [
    { name: "Mathias F. Gruber", url: "https://github.com/MathiasGruber/TheNinjaRPG" },
  ],
  creator: "Mathias F. Gruber",
  publisher: "Studie-Tech ApS",
  openGraph: {
    title: title,
    description: description,
    url: "https://www.theninja-rpg.com",
    siteName: "TheNinja-RPG",
    images: [
      {
        url: IMG_LOGO_FULL,
        width: 512,
        height: 768,
        alt: "TheNinja-RPG Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: title,
    description: description,
    siteId: "137431404",
    creator: "@nextjs",
    creatorId: "137431404",
    images: [IMG_LOGO_FULL], // Must be an absolute URL
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
  maximumScale: 5,
  userScalable: true,
};
