import React, { useState, useEffect } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import ReactHtmlParser from "react-html-parser";
import {
  ChatBubbleLeftEllipsisIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/solid";

import Button from "@/layout/Button";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Countdown from "@/layout/Countdown";
import RichInput from "@/layout/RichInput";
import SliderField from "@/layout/SliderField";
import Post from "@/layout/Post";
import ParsedReportJson from "@/layout/ReportReason";
import Loader from "@/layout/Loader";

import { CommentOnReport } from "@/layout/Comment";
import { api } from "@/utils/api";
import { type ReportCommentSchema } from "../../validators/reports";
import { reportCommentSchema } from "../../validators/reports";
import { show_toast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reportCommentColor } from "@/utils/reports";
import { reportCommentExplain } from "@/utils/reports";

import { canPostReportComment } from "../../validators/reports";
import { canModerateReports } from "../../validators/reports";
import { canEscalateBan } from "../../validators/reports";
import { canClearReport } from "../../validators/reports";

const Report: NextPage = () => {
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const report_id = router.query.reportid as string;

  const { data: report, refetch: refetchReport } = api.reports.get.useQuery(
    { id: report_id },
    { enabled: report_id !== undefined },
  );

  const {
    data: comments,
    fetchNextPage,
    hasNextPage,
    refetch: refetchComments,
  } = api.comments.getReportComments.useInfiniteQuery(
    { id: report_id, limit: 20 },
    {
      enabled: report !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    },
  );
  const allComments = comments?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Form handling
  const {
    handleSubmit,
    reset,
    register,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<ReportCommentSchema>({
    defaultValues: {
      banTime: 0,
    },
    resolver: zodResolver(reportCommentSchema),
  });

  const watchedLength = watch("banTime", 0);

  const { mutate: createComment, isLoading: load1 } =
    api.comments.createReportComment.useMutation({
      onSuccess: async () => {
        reset();
        await refetchComments();
      },
      onError: (error) => {
        show_toast("Error on creating comment", error.message, "error");
      },
    });

  const { mutate: banUser, isLoading: load2 } = api.reports.ban.useMutation({
    onSuccess: async () => {
      await refetchReport();
      await refetchComments();
      reset();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });

  const { mutate: escalateReport, isLoading: load3 } = api.reports.escalate.useMutation(
    {
      onSuccess: async () => {
        await refetchReport();
        await refetchComments();
        reset();
      },
      onError: (error) => {
        show_toast("Error on excalating report", error.message, "error");
      },
    },
  );

  const { mutate: clearReport, isLoading: load4 } = api.reports.clear.useMutation({
    onSuccess: async () => {
      await refetchReport();
      await refetchComments();
      await refetchUser();
      reset();
    },
    onError: (error) => {
      show_toast("Error on clearing report", error.message, "error");
    },
  });

  const isLoading = load1 || load2 || load3 || load4;

  useEffect(() => {
    if (report) {
      setValue("object_id", report.id);
    }
  }, [report, setValue]);

  const handleSubmitComment = handleSubmit(
    (data) => createComment(data),
    (errors) => console.log(errors),
  );

  const handleSubmitBan = handleSubmit(
    (data) => banUser(data),
    (errors) => console.log(errors),
  );

  const handleSubmitEscalation = handleSubmit(
    (data) => escalateReport(data),
    (errors) => console.log(errors),
  );

  const handleSubmitClear = handleSubmit(
    (data) => clearReport(data),
    (errors) => console.log(errors),
  );

  if (!userData || !report) {
    return <Loader explanation="Loading data..." />;
  }

  // Permissions determining look of page
  const canComment = canPostReportComment(report);
  const canEscalate = canEscalateBan(userData, report);
  const canClear = canClearReport(userData, report);
  const canBan = canModerateReports(userData, report);
  const canWrite = canComment || canEscalate || canClear || canBan;

  return (
    <>
      <ContentBox
        title="Reports"
        back_href="/reports"
        subtitle="Details about user report"
      >
        {report.reportedUser && (
          <>
            <Post user={report.reportedUser} hover_effect={true}>
              {report.banEnd && (
                <div className="mb-3">
                  <b>Ban countdown:</b> <Countdown targetDate={report.banEnd} />
                  <hr />
                </div>
              )}
              <ParsedReportJson report={report} />
              <b>Report by</b> {report.reporterUser?.username}
            </Post>
          </>
        )}
      </ContentBox>

      <ContentBox title="Further Input / Chat" initialBreak={true}>
        <form>
          <div className="mb-3">
            {canBan && (
              <SliderField
                id="banTime"
                default={0}
                min={0}
                max={365}
                unit="days"
                label="Select ban duration in days"
                register={register}
                setValue={setValue}
                watchedValue={watchedLength}
                error={errors.banTime?.message}
              />
            )}
            {canWrite && (
              <RichInput
                id="comment"
                height="200"
                disabled={isLoading}
                label="Add information or ask questions"
                error={errors.comment?.message}
                control={control}
              />
            )}
            {isLoading && <Loader explanation="Executing action..." />}
            {!isLoading && (
              <div className="flex flex-row-reverse">
                {canComment && (
                  <Confirm
                    title="Confirm Posting Comment"
                    button={
                      <Button
                        id="submit_comment"
                        label="Add Comment"
                        image={<ChatBubbleLeftEllipsisIcon className="mr-1 h-5 w-5" />}
                      />
                    }
                    onAccept={async () => {
                      await handleSubmitComment();
                    }}
                  >
                    You are about to post a comment on this report. Please note that
                    this comment can not be edited or deleted afterwards
                  </Confirm>
                )}
                {!canBan && canEscalate && (
                  <Confirm
                    title="Confirm Escalating Report"
                    button={
                      <Button
                        id="submit_comment"
                        color="blue"
                        label="Escalate"
                        image={<RocketLaunchIcon className="mr-1 h-5 w-5" />}
                      />
                    }
                    onAccept={async () => {
                      await handleSubmitEscalation();
                    }}
                  >
                    You can chose to escalate this report to admin-level. Please only do
                    this if you feel strongly the decision is wrong, and know that if
                    you do not have good reason for escalating, it may result in further
                    extension of the ban.
                  </Confirm>
                )}
                {canBan && (
                  <Confirm
                    title="Confirm Banning User"
                    button={
                      <Button
                        id="submit_resolve"
                        label={canClear ? "Edit Ban" : "Ban User"}
                        color="red"
                        image={<ShieldExclamationIcon className="mr-1 h-5 w-5" />}
                      />
                    }
                    onAccept={async () => {
                      await handleSubmitBan();
                    }}
                  >
                    You are about to ban the user. Please note that the comment and
                    decision can not be edited or deleted. You can unban the person by
                    posting another comment and &rdquo;Clear&rdquo; the report.
                  </Confirm>
                )}
                {canClear && (
                  <Confirm
                    title="Confirm Clearing Report"
                    button={
                      <Button
                        id="submit_resolve"
                        color="green"
                        label="Clear Report"
                        image={<ShieldCheckIcon className="mr-1 h-5 w-5" />}
                      />
                    }
                    onAccept={async () => {
                      await handleSubmitClear();
                    }}
                  >
                    You are about to clear the report. Please note that the comment and
                    decision can not be edited or deleted.
                  </Confirm>
                )}
              </div>
            )}
          </div>
        </form>
        {allComments &&
          allComments.map((comment, i) => (
            <div
              key={comment.id}
              ref={i === allComments.length - 1 ? setLastElement : null}
            >
              <CommentOnReport
                title={reportCommentExplain(comment.decision)}
                user={comment.user}
                hover_effect={false}
                comment={comment}
                color={reportCommentColor(comment.decision)}
                refetchComments={async () => await refetchComments()}
              >
                {ReactHtmlParser(comment.content)}
              </CommentOnReport>
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default Report;
