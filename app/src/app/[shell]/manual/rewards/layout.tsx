import { noindexMetadata } from "@/libs/seo";
export const metadata = noindexMetadata("Rewards");
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
