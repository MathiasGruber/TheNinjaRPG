import { noindexMetadata } from "@/libs/seo";
export const metadata = noindexMetadata("Dungeon Content");
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
