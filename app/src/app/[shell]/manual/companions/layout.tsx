import type { Metadata } from "next";
import { buildMetadata } from "@/libs/seo";

export const metadata: Metadata = buildMetadata({
  title: "Companion Species",
  description: "Companion species, visual traits and rarity in TheNinja-RPG.",
  path: "/manual/companions",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
