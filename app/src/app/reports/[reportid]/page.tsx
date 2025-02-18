"use client";

import { useState, useEffect, use } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseHtml } from "@/utils/parse";
import { MessagesSquare, Rocket, ShieldAlert } from "lucide-react";
import { EarOff, Ban, Eraser } from "lucide-react";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Countdown from "@/layout/Countdown";
import RichInput from "@/layout/RichInput";
import SliderField from "@/layout/SliderField";
import Post from "@/layout/Post";
import ParsedReportJson from "@/layout/ReportReason";
import Loader from "@/layout/Loader";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CommentOnReport } from "@/layout/Comment";
import { api } from "@/app/_trpc/client";
import { reportCommentSchema } from "@/validators/reports";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reportCommentColor } from "@/utils/reports";
import { reportCommentExplain } from "@/utils/reports";
import { showMutationToast } from "@/libs/toast";
import { canPostReportComment } from "@/utils/permissions";
import { canModerateReports } from "@/utils/permissions";
import { canBanUsers } from "@/utils/permissions";
import { canSilenceUsers } from "@/utils/permissions";
import { canWarnUsers } from "@/utils/permissions";
import { canEscalateBan } from "@/utils/permissions";
import { canClearReport } from "@/utils/permissions";
import { TimeUnits } from "@/drizzle/constants";
import { TERR_BOT_ID } from "@/drizzle/constants";
import type { ReportCommentSchema } from "@/validators/reports";
import type { TimeUnit } from "@/drizzle/constants";
import type { BaseServerResponse } from "@/server/api/trpc";

export default function Report(props: { params: Promise<{ reportid: string }> }) {
  const params = use(props.params);
  const { data: userData, timeDiff } = useRequiredUserData();

  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  const report_id = params.reportid;

  const { data } = api.reports.get.useQuery(
    { id: report_id },
    { enabled: !!report_id && !!userData },
  );
  const { report, prevReports } = data || {};

  const {
    data: comments,
    fetchNextPage,
    hasNextPage,
  } = api.comments.getReportComments.useInfiniteQuery(
    { id: report_id, limit: 20 },
    {
      enabled: report !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allComments = comments?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

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
      banTimeUnit: "days",
    },
    resolver: zodResolver(reportCommentSchema),
  });

  const watchedComment = watch("comment", "");
  const watchedLength = watch("banTime", 0);
  const watchedUnit = watch("banTimeUnit", "days");

  // Get utils
  const utils = api.useUtils();

  // How to deal with success responses
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    await utils.reports.getAll.invalidate();
    await utils.reports.get.invalidate();
    await utils.comments.getReportComments.invalidate();
    await utils.profile.getUser.invalidate();
    reset();
  };

  const banUser = api.reports.ban.useMutation({ onSuccess });
  const clearReport = api.reports.clear.useMutation({ onSuccess });
  const createComment = api.comments.createReportComment.useMutation({ onSuccess });
  const escalateReport = api.reports.escalate.useMutation({ onSuccess });
  const silenceUser = api.reports.silence.useMutation({ onSuccess });
  const warnUser = api.reports.warn.useMutation({ onSuccess });

  const isPending =
    banUser.isPending ||
    clearReport.isPending ||
    createComment.isPending ||
    escalateReport.isPending ||
    silenceUser.isPending ||
    warnUser.isPending;

  const isAi =
    allComments !== undefined &&
    allComments.length === 0 &&
    report &&
    report.reporterUserId === TERR_BOT_ID;

  useEffect(() => {
    if (report) {
      setValue("object_id", report.id);
      if (isAi && watchedComment === "") {
        setValue("comment", report.reason);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAi, report, setValue]);

  const handleSubmitComment = handleSubmit(
    (data) => createComment.mutate(data),
    (errors) => console.error(errors),
  );

  const handleSubmitBan = handleSubmit(
    (data) => banUser.mutate(data),
    (errors) => console.error(errors),
  );

  const handleSubmitSilence = handleSubmit(
    (data) => silenceUser.mutate(data),
    (errors) => console.error(errors),
  );

  const handleSubmitEscalation = handleSubmit(
    (data) => escalateReport.mutate(data),
    (errors) => console.error(errors),
  );

  const handleSubmitClear = handleSubmit(
    (data) => clearReport.mutate(data),
    (errors) => console.error(errors),
  );

  const handleSubmitWarn = handleSubmit(
    (data) => warnUser.mutate(data),
    (errors) => console.error(errors),
  );

  if (!userData || !report) {
    return <Loader explanation="Loading data..." />;
  }

  // Permissions determining look of page
  const canComment = canPostReportComment(report);
  const canEscalate = canEscalateBan(userData, report);
  const canClear = canClearReport(userData, report);
  const canModerate = canModerateReports(userData, report);
  const canBan = canBanUsers(userData);
  const canSilence = canSilenceUsers(userData);
  const canWarn = canWarnUsers(userData);
  const canWrite = canComment || canEscalate || canClear || canModerate;

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
                  <b>Ban countdown:</b>{" "}
                  <Countdown targetDate={report.banEnd} timeDiff={timeDiff} />
                  <hr />
                </div>
              )}
              <ParsedReportJson report={report} />
              {report.reporterUser?.username && (
                <div>
                  <b>Report by</b> {report.reporterUser?.username}
                  <br />
                </div>
              )}
              <b>Current status:</b> {report.status}
            </Post>
          </>
        )}
      </ContentBox>

      <ContentBox title="Further Input / Chat" initialBreak={true}>
        <form>
          <div className="mb-3">
            {canModerate && (
              <div className="flex flex-row items-end">
                <div className="grow">
                  <SliderField
                    id="banTime"
                    default={0}
                    min={0}
                    max={100}
                    unit={watchedUnit}
                    label={`Select duration in ${watchedUnit}`}
                    register={register}
                    setValue={setValue}
                    watchedValue={watchedLength}
                    error={errors.banTime?.message}
                  />
                </div>
                <Select
                  onValueChange={(e) => setValue("banTimeUnit", e as TimeUnit)}
                  defaultValue={watchedUnit}
                  value={watchedUnit}
                >
                  <SelectTrigger className="basis-1/4 m-1">
                    <SelectValue placeholder={`None`} />
                  </SelectTrigger>
                  <SelectContent>
                    {TimeUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {canWrite && (
              <RichInput
                id="comment"
                height="200"
                disabled={isPending}
                label="Add information or ask questions"
                error={errors.comment?.message}
                control={control}
              />
            )}
            {canWrite && report.reportedUserId !== userData.userId && (
              <div className="p-2 flex flex-row gap-2">
                {isAi && (
                  <Badge
                    className="bg-slate-500"
                    onClick={() => setValue("comment", "False positive from AI")}
                  >
                    False Positive from AI
                  </Badge>
                )}
                <Badge
                  className="bg-slate-500"
                  onClick={() => setValue("comment", "This report is unjustified")}
                >
                  Unjustified report
                </Badge>
              </div>
            )}
            {isPending && <Loader explanation="Executing action..." />}
            {!isPending && (
              <div className="flex flex-row-reverse gap-1 mt-2">
                {canComment && (
                  <Confirm
                    title="Confirm Posting Comment"
                    button={
                      <Button id="submit_comment">
                        <MessagesSquare className="mr-2 h-5 w-5" />
                        Comment
                      </Button>
                    }
                    onAccept={async () => {
                      await handleSubmitComment();
                    }}
                  >
                    You are about to post a comment on this report. Please note that
                    this comment can not be edited or deleted afterwards
                  </Confirm>
                )}
                {!canModerate && canEscalate && (
                  <Confirm
                    title="Confirm Escalating Report"
                    button={
                      <Button id="submit_comment">
                        <Rocket className="mr-2 h-5 w-5" /> Escalate
                      </Button>
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
                {canModerate && canSilence && (
                  <Confirm
                    title="Confirm Silencing User"
                    button={
                      <Button id="submit_resolve" variant="destructive">
                        <EarOff className="mr-2 h-5 w-5" />
                        Silence
                      </Button>
                    }
                    onAccept={async () => {
                      await handleSubmitSilence();
                    }}
                  >
                    You are about to silence the user. Please note that the comment and
                    decision can not be edited or deleted. You can unsilence the person
                    by posting another comment and &rdquo;Clear&rdquo; the report.
                  </Confirm>
                )}
                {canModerate && canBan && (
                  <Confirm
                    title="Confirm Banning User"
                    button={
                      <Button id="submit_resolve" variant="destructive">
                        <Ban className="mr-2 h-5 w-5" />
                        Ban
                      </Button>
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
                {canModerate && canWarn && (
                  <Confirm
                    title="Confirm Warning"
                    button={
                      <Button id="submit_resolve" className="bg-orange-400">
                        <ShieldAlert className="mr-2 h-5 w-5" />
                        Warn
                      </Button>
                    }
                    onAccept={async () => {
                      await handleSubmitWarn();
                    }}
                  >
                    You are about to warn this user. Please note that the comment and
                    decision can not be edited or deleted.
                  </Confirm>
                )}
                {canModerate && canClear && (
                  <Confirm
                    title="Confirm Clearing Report"
                    button={
                      <Button id="submit_resolve" className="bg-green-600">
                        <Eraser className="mr-2 h-5 w-5" />
                        Clear
                      </Button>
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
        {allComments?.map((comment, i) => (
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
            >
              {parseHtml(comment.content)}
            </CommentOnReport>
          </div>
        ))}
      </ContentBox>
      {report.additionalContext.length > 0 && (
        <ContentBox
          title="Conversatino Context"
          subtitle="Latest 10 messages leading up to report"
          initialBreak
        >
          {report.additionalContext.map((context, i) => (
            <Post key={`context-${i}`} user={context}>
              {context.content}
              <p className="absolute bottom-0 right-2 italic text-xs text-gray-600">
                @{context.createdAt.toLocaleString()}
              </p>
            </Post>
          ))}
        </ContentBox>
      )}
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
                  <ParsedReportJson report={report} />
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
