import type { Metadata } from "next";
import { PET_SANCTUARY_NAME } from "@/drizzle/constants";
import { noindexMetadata } from "@/libs/seo";

/** Keep the authenticated sanctuary out of search results for every shell variant. */
export const metadata: Metadata = noindexMetadata(PET_SANCTUARY_NAME);

/** Supply sanctuary metadata without introducing another visual page wrapper. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
