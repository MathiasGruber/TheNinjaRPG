import type { Metadata } from "next";
import { buildMetadata } from "@/libs/seo";

export const metadata: Metadata = buildMetadata({
  title: "Game Layouts",
  description: "Choose a setting for your journey through Seichi.",
  path: "/layouts",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
