import ContentBox from "@/layout/ContentBox";

export default function NotFound() {
  return (
    <ContentBox title="404: Page Not Found">
      <p>The page you are trying to access could not be found 😅 </p>
      <p>Please check the URL and try again.</p>
    </ContentBox>
  );
}
