import React from "react";
import Link from "next/link";
import Post from "@/layout/Post";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Countdown from "@/layout/Countdown";
import ParsedReportJson from "@/layout/ReportReason";
import { reportCommentExplain } from "@/utils/reports";
import { reportCommentColor } from "@/utils/reports";
import { api } from "@/utils/api";

interface BanInfoProps {
  hideContentBox?: boolean;
}

const BanInfo: React.FC<BanInfoProps> = (props) => {
  const { data: report } = api.reports.getBan.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (!report?.reportedUser) return <Loader explanation="Loading ban info" />;

  // Pre defined post component
  const post = (
    <Post
      title={reportCommentExplain(report.status)}
      color={reportCommentColor(report.status)}
      user={report.reportedUser}
      hover_effect={true}
    >
      {report.banEnd && (
        <div className="mb-3">
          <b>Ban countdown:</b> <Countdown targetDate={report.banEnd} />
          <hr />
        </div>
      )}
      <ParsedReportJson report={report} />
      <b>Report by</b> {report.reportedUser.username}
    </Post>
  );

  if (props.hideContentBox) {
    return post;
  } else {
    return (
      <ContentBox title="No Access" subtitle="You are banned" back_href="/profile">
        {post}
      </ContentBox>
    );
  }
};

export default BanInfo;
