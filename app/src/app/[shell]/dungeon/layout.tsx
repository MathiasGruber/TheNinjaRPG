import { noindexMetadata } from "@/libs/seo";
export const metadata = noindexMetadata("Dungeon Pyramids");
/** Keep authenticated party state out of search indexing without adding a second layout shell. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
