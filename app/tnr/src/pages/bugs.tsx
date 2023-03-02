import { useState } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import Button from "../layout/Button";
import InputField from "../layout/InputField";
import SelectField from "../layout/SelectField";
import ContentBox from "../layout/ContentBox";
import RichInput from "../layout/RichInput";
import Confirm from "../layout/Confirm";
import ReportUser from "../layout/Report";
import Toggle from "../layout/Toggle";
import Post from "../layout/Post";
import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  TrashIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";

import { api } from "../utils/api";
import { systems } from "../validators/bugs";
import { bugreportSchema } from "../validators/bugs";
import { show_toast } from "../libs/toast";
import { useInfinitePagination } from "../libs/pagination";
import { useUser } from "../utils/UserContext";
import { type BugreportSchema } from "../validators/bugs";

const BugReport: NextPage = () => {
  const { data: sessionData } = useSession();
  const { data: userData } = useUser();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showActive, setShowActive] = useState<boolean>(true);

  const {
    data: bugs,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = api.bugs.getAll.useInfiniteQuery(
    {
      is_active: showActive,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allBugs = bugs?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<BugreportSchema>({
    resolver: zodResolver(bugreportSchema),
  });

  const createReport = api.bugs.create.useMutation({
    onSuccess: async () => {
      await refetch();
      reset();
    },
    onError: (error) => {
      show_toast("Error on fetching latest bugs", error.message, "error");
    },
  });

  const createVote = api.bugs.vote.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on upvoting bug", error.message, "error");
    },
  });

  const deleteReport = api.bugs.delete.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on deleting bug", error.message, "error");
    },
  });

  const onSubmit = handleSubmit((data) => {
    createReport.mutate(data);
  });

  return (
    <ContentBox
      title="Report Bugs"
      subtitle="Found a bug? Let us know!"
      topRightContent={
        sessionData && (
          <div className="flex flex-row items-center">
            <Toggle value={showActive} setShowActive={setShowActive} />
            {userData && !sessionData.user?.isBanned && (
              <Confirm
                title="Write a new bug report"
                proceed_label="Submit"
                button={<Button id="report" label="New Report" />}
                onAccept={onSubmit}
              >
                <InputField
                  id="title"
                  label="Title for your report"
                  register={register}
                  error={errors.title?.message}
                />
                <SelectField
                  id="system"
                  label="Where did the error occur?"
                  register={register}
                  error={errors.system?.message}
                  placeholder="Pick page"
                >
                  {systems.map((system) => (
                    <option key={system} value={system}>
                      {system === "unknown" ? (
                        <>Do not know. Please provide details in the description.</>
                      ) : (
                        window.location.origin + "/" + system
                      )}
                    </option>
                  ))}
                </SelectField>
                <RichInput
                  id="content"
                  label="Describe the bug"
                  height="300"
                  placeholder="
                  <p><b>Describe the bug: </b> write here...</p>
                  <p><b>How to reproduce: </b> write here...</p>
                  <p><b>Expected behavior: </b> write here...</p>
                  <p><b>Device Information: </b> mobile/tablet/desktop? browser?</p>"
                  control={control}
                  error={errors.content?.message}
                />
              </Confirm>
            )}
          </div>
        )
      }
    >
      {allBugs &&
        allBugs.map((bug, i) => (
          <div key={bug.id} ref={i === allBugs.length - 1 ? setLastElement : null}>
            <Link href={"/bugs/" + bug.id}>
              <Post
                title={bug.title}
                hover_effect={true}
                options={
                  <div className="flex flex-col items-center">
                    <p className="text-2xl font-bold">{bug.popularity}</p>
                    <p className="">votes</p>
                    <div className="flex flex-row">
                      <div
                        className="mr-1"
                        onClick={(e) => {
                          e.preventDefault();
                          createVote.mutate({ id: bug.id, value: -1 });
                        }}
                      >
                        <HandThumbDownIcon
                          className={`h-6 w-6 ${
                            bug.votes?.[0]?.value && bug.votes?.[0]?.value < 0
                              ? "fill-orange-500"
                              : "hover:fill-orange-500"
                          }`}
                        />
                      </div>
                      <div
                        className="mr-1"
                        onClick={(e) => {
                          e.preventDefault();
                          createVote.mutate({ id: bug.id, value: 1 });
                        }}
                      >
                        <HandThumbUpIcon
                          className={`h-6 w-6 ${
                            bug.votes?.[0]?.value && bug.votes?.[0]?.value > 0
                              ? "fill-orange-500"
                              : "hover:fill-orange-500"
                          }`}
                        />
                      </div>
                      <div
                        className="mr-1"
                        onClick={(e) => {
                          e.preventDefault();
                        }}
                      >
                        <ReportUser
                          user={bug.user}
                          content={bug}
                          system="bug_report"
                          button={
                            <FlagIcon className="h-6 w-6 hover:fill-orange-500" />
                          }
                        />
                      </div>
                      {sessionData?.user?.role == "ADMIN" && (
                        <Confirm
                          title="Confirm Bug Report Deletion"
                          button={
                            <TrashIcon className="h-6 w-6 hover:fill-orange-500" />
                          }
                          onAccept={(e) => {
                            e.preventDefault();
                            deleteReport.mutate({ id: bug.id });
                          }}
                        >
                          You are about to delete a bug report. Are you sure? If the bug
                          is resolved, it should simply be closed.
                        </Confirm>
                      )}
                    </div>
                  </div>
                }
              >
                <div>
                  {bug.summary}
                  <br />
                  <b>System:</b> {bug.system}, <b>Report by</b> {bug.user.username} at{" "}
                  {bug.createdAt.toLocaleDateString()}
                </div>
              </Post>
            </Link>
          </div>
        ))}
    </ContentBox>
  );
};

export default BugReport;
