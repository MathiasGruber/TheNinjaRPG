import { useState, useEffect } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import Link from "next/link";
import ContentBox from "../layout/ContentBox";
import Toggle from "../layout/Toggle";
import Post from "../layout/Post";
import Countdown from "../layout/Countdown";
import InputField from "../layout/InputField";
import Loader from "../layout/Loader";
import ParsedReportJson from "../layout/ReportReason";

import { useSession } from "next-auth/react";
import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { useRequiredUser } from "../utils/UserContext";
import { reportCommentExplain } from "../utils/reports";
import { reportCommentColor } from "../utils/reports";
import { userSearchSchema } from "../validators/register";
import { type UserSearchSchema } from "../validators/register";

const Reports: NextPage = () => {
  const { data: sessionData } = useSession();
  useRequiredUser();

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showActive, setShowActive] = useState<boolean>(true);

  const {
    data: reports,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.reports.getAll.useInfiniteQuery(
    {
      ...(sessionData?.user?.role === "USER" ? {} : { is_active: showActive }),
      ...(searchTerm ? { username: searchTerm } : {}),
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allReports = reports?.pages.map((page) => page.data).flat();

  const {
    register,
    watch,
    formState: { errors },
  } = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
  });

  const watchUsername = watch("username", "");

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(watchUsername);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchUsername, setSearchTerm]);

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  return (
    <ContentBox
      title="Reports"
      subtitle={
        sessionData?.user?.role === "USER" ? "View your reports" : "Overall Overview"
      }
      topRightContent={
        sessionData &&
        sessionData.user?.role !== "USER" && (
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
        allReports &&
        allReports.flatMap(
          (report, i) =>
            report.reportedUser && (
              <div
                key={report.id}
                ref={i === allReports.length - 1 ? setLastElement : null}
              >
                <Link href={"/reports/" + report.id}>
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
                    <b>Report by</b> {report.reporterUser?.username}
                  </Post>
                </Link>
              </div>
            )
        )
      )}
    </ContentBox>
  );
};

export default Reports;
