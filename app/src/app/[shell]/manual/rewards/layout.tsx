import { noindexMetadata } from "@/libs/seo";
export const metadata = noindexMetadata("Rewards");
/** Keep the staff catalog out of search indexes while inheriting the manual layout. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
