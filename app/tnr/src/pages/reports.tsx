import { useState } from "react";
import { type NextPage } from "next";

import Link from "next/link";
import ContentBox from "../layout/ContentBox";
import Toggle from "../layout/Toggle";
import Post from "../layout/Post";
import Countdown from "../layout/Countdown";
import InputField from "../layout/InputField";
import Loader from "../layout/Loader";
import ParsedReportJson from "../layout/ReportReason";

import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { useRequiredUserData } from "../utils/UserContext";
import { reportCommentExplain } from "../utils/reports";
import { reportCommentColor } from "../utils/reports";
import { useUserSearch } from "../utils/search";

const Reports: NextPage = () => {
  const { data: userData } = useRequiredUserData();

  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showActive, setShowActive] = useState<boolean>(true);
  const { register, errors, searchTerm } = useUserSearch();

  const {
    data: reports,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.reports.getAll.useInfiniteQuery(
    {
      ...(userData?.role === "USER" ? {} : { is_active: showActive }),
      ...(searchTerm ? { username: searchTerm } : {}),
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const allReports = reports?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  return (
    <ContentBox
      title="Reports"
      subtitle={userData?.role === "USER" ? "View your reports" : "Overall Overview"}
      topRightContent={
        userData?.role !== "USER" && (
          <div className="flex flex-row items-center">
            <InputField
              id="username"
              placeholder="Search Username"
              register={register}
              error={errors.username?.message}
            />
            <div className="px-2"></div>
            <Toggle value={showActive} setShowActive={setShowActive} />
          </div>
        )
      }
    >
      {isFetching ? (
        <Loader explanation="Fetching Results..." />
      ) : (
        <div>
          {allReports?.length === 0 && <p>No reports found</p>}
          {allReports?.flatMap((entry, i) => {
            const report = entry.UserReport;
            const reportedUser = entry.reportedUser;
            return (
              reportedUser && (
                <div
                  key={report.id}
                  ref={i === allReports.length - 1 ? setLastElement : null}
                >
                  <Link href={"/reports/" + report.id}>
                    <Post
                      title={reportCommentExplain(report.status)}
                      color={reportCommentColor(report.status)}
                      user={reportedUser}
                      hover_effect={true}
                    >
                      {report.banEnd && (
                        <div className="mb-3">
                          <b>Ban countdown:</b> <Countdown targetDate={report.banEnd} />
                          <hr />
                        </div>
                      )}
                      <ParsedReportJson report={report} />
                      <b>Report by</b> {reportedUser.username}
                    </Post>
                  </Link>
                </div>
              )
            );
          })}
        </div>
      )}
    </ContentBox>
  );
};

export default Reports;
