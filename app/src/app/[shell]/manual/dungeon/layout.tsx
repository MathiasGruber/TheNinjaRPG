import { noindexMetadata } from "@/libs/seo";
export const metadata = noindexMetadata("Dungeon Content");
/** Keep staff content tools out of search indexing while reusing the surrounding manual layout. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
