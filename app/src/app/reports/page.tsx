"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import AvatarImage from "@/layout/Avatar";
import Toggle from "@/components/control/Toggle";
import Post from "@/layout/Post";
import Countdown from "@/layout/Countdown";
import Loader from "@/layout/Loader";
import ParsedReportJson from "@/layout/ReportReason";
import { Presentation, Eraser, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reportCommentExplain } from "@/utils/reports";
import { reportCommentColor } from "@/utils/reports";
import { useUserSearch } from "@/utils/search";
import { TERR_BOT_ID } from "@/drizzle/constants";

export default function Reports() {
  const { data: userData } = useRequiredUserData();

  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showUnhandled, setShowUnhandled] = useState<boolean | undefined>(true);
  const [showAll, setShowAll] = useState<boolean | undefined>(undefined);
  const { form, searchTerm } = useUserSearch();

  // Get utils
  const utils = api.useUtils();

  // Query
  const {
    data: reports,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.reports.getAll.useInfiniteQuery(
    {
      isUnhandled: showUnhandled,
      showAll: showAll,
      ...(searchTerm ? { username: searchTerm } : {}),
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
      enabled: userData !== undefined,
    },
  );
  const allReports = reports?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutation
  const clearReport = api.reports.clear.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await utils.reports.getAll.invalidate();
    },
  });

  // If this is a user, do not show unhandled reports
  const isUser = userData?.role === "USER";
  useEffect(() => {
    if (isUser) {
      setShowUnhandled(false);
    }
  }, [isUser]);

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox
      title="Reports"
      subtitle={userData?.role === "USER" ? "Your reports" : "Overview"}
      topRightContent={
        <div>
          <div className="flex flex-col items-start">
            {userData?.role !== "USER" && (
              <div className="w-full flex flex-row items-center gap-1">
                <Form {...form}>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormControl>
                          <Input placeholder="Search user" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Form>
                <Link href="/reports/statistics">
                  <Button id="report-statistics" hoverText="Staff Activity Overview">
                    <Presentation className="h-6 w-6" />
                  </Button>
                </Link>
                <Link href="/reports/bot-performance">
                  <Button id="bot-performance" hoverText="Mod Bot Performance">
                    <Bot className="h-6 w-6" />
                  </Button>
                </Link>
              </div>
            )}
            <div className="pb-2"></div>
            <div className="w-full flex flex-row pb-2 m-1 gap-2">
              {!isUser && (
                <Toggle
                  id="toggle-report-handled"
                  value={showUnhandled}
                  setShowActive={setShowUnhandled}
                />
              )}
              {!showUnhandled && (
                <Toggle
                  id="toggle-report-all"
                  value={showAll}
                  setShowActive={setShowAll}
                  labelActive="All"
                  labelInactive="Ban/Warning"
                />
              )}
            </div>
          </div>
        </div>
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
            const isAi =
              "reporterUserId" in report && report.reporterUserId === TERR_BOT_ID;
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
                      image={
                        <div className="... mr-3 basis-2/12 truncate text-center sm:basis-3/12 sm:text-base">
                          <AvatarImage
                            href={reportedUser.avatar}
                            userId={reportedUser.userId}
                            alt={reportedUser.username}
                            size={100}
                          />
                        </div>
                      }
                      hover_effect={true}
                    >
                      {report.banEnd && (
                        <div className="mb-3">
                          <b>Ban countdown:</b> <Countdown targetDate={report.banEnd} />
                          <hr />
                        </div>
                      )}
                      <ParsedReportJson report={report} />
                      {isAi && showUnhandled && (
                        <div className="flex flex-row p-3">
                          <div className="grow"></div>
                          <Button
                            id="submit_resolve"
                            className="bg-green-600"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              clearReport.mutate({
                                comment: "False positive from AI",
                                object_id: report.id,
                                banTime: 0,
                                banTimeUnit: "minutes",
                              });
                            }}
                          >
                            <Eraser className="mr-2 h-5 w-5" />
                            False Positive from AI
                          </Button>
                        </div>
                      )}
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
}
