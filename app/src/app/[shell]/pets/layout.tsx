import type { Metadata } from "next";
import { PET_SANCTUARY_NAME } from "@/drizzle/constants";
import { noindexMetadata } from "@/libs/seo";

export const metadata: Metadata = noindexMetadata(PET_SANCTUARY_NAME);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
