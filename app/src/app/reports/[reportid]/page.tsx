"use client";

import { use } from "react";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Post from "@/layout/Post";
import ParsedReportJson from "@/layout/ReportReason";
import Loader from "@/layout/Loader";
import DisplayUserReport from "@/layout/UserReport";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";

export default function Report(props: { params: Promise<{ reportid: string }> }) {
  const params = use(props.params);
  const { data: userData } = useRequiredUserData();

  const report_id = params.reportid;

  const { data } = api.reports.get.useQuery(
    { id: report_id },
    { enabled: !!report_id && !!userData },
  );
  const { report, prevReports } = data || {};

  if (!userData || !report) {
    return <Loader explanation="Loading data..." />;
  }

  return (
    <>
      <DisplayUserReport report={report} />
      {prevReports && prevReports.length > 0 && (
        <ContentBox
          title="Related Reports"
          subtitle="Note: Search will be improved once Vector Search is available"
          initialBreak
        >
          {prevReports?.map((report, i) => (
            <Link href={"/reports/" + report.id} key={`report-key-${i}`}>
              <Post hover_effect={true}>
                <div className="p-2">
                  <ParsedReportJson report={report} viewer={userData} />
                  <b>Current status:</b> {report.status}
                </div>
              </Post>
            </Link>
          ))}
        </ContentBox>
      )}
    </>
  );
}
