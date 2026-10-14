import type { Metadata } from "next";
import { noindexMetadata } from "@/libs/seo";

export const metadata: Metadata = noindexMetadata("Quest Teams");

/** Reuse the authenticated shell while keeping team discovery out of search indexing. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
