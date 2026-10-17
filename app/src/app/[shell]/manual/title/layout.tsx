import type { Metadata } from "next";
import { noindexMetadata } from "@/libs/seo";
export const metadata: Metadata = noindexMetadata("Titles");
/** Render title-management pages under the catalog's shared no-index metadata. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
