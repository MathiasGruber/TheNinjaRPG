import React from "react";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import DisplayUserReport from "@/layout/UserReport";
import { api } from "@/app/_trpc/client";

interface BanInfoProps {
  placeholder?: string;
}

const BanInfo: React.FC<BanInfoProps> = () => {
  const { data: report } = api.reports.getBan.useQuery(undefined);

  if (!report?.reportedUser) return <Loader explanation="Loading ban info" />;

  return (
    <>
      <ContentBox title="No Access" subtitle="You are banned" back_href="/profile">
        Please wait for your ban to end before you can access this page.
      </ContentBox>
      {report && (
        <DisplayUserReport report={report} initialBreak={true} hideHrefBack={true} />
      )}
    </>
  );
};

export default BanInfo;
