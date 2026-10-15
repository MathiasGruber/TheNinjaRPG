import type { Metadata } from "next";
import { noindexMetadata } from "@/libs/seo";
export const metadata: Metadata = noindexMetadata("Wake Island Tournaments");
/** Keep authenticated tournament pages out of search indexes without adding a visual wrapper. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
