import { useState } from "react";
import { type NextPage } from "next";
import { useForm, FormProvider } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import Button from "../layout/Button";
import InputField from "../layout/InputField";
import SelectField from "../layout/SelectField";
import ContentBox from "../layout/ContentBox";
import RichInput from "../layout/RichInput";
import Confirm from "../layout/Confirm";
import { HandThumbDownIcon } from "@heroicons/react/24/outline";
import { HandThumbUpIcon } from "@heroicons/react/24/outline";
import { TrashIcon } from "@heroicons/react/24/outline";

import Modal from "../layout/Modal";
import Post from "../layout/Post";
import { api } from "../utils/api";
import { systems } from "../validators/bugs";
import { type BugreportSchema } from "../validators/bugs";
import { bugreportSchema } from "../validators/bugs";
import { show_toast } from "../libs/toast";
import { useInfinitePagination } from "../libs/pagination";

const BugReport: NextPage = () => {
  const { data: sessionData } = useSession();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
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

  const createReport = api.bugs.create.useMutation({
    onSuccess: async () => {
      await refetch();
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

  // Form handling
  const methods = useForm<BugreportSchema>({
    resolver: zodResolver(bugreportSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = methods;
  const onSubmit = handleSubmit(async (data) => {
    createReport.mutate(data);
    await refetch();
    setShowModal(false);
    reset();
  });

  return (
    <ContentBox
      title="Report Bugs"
      subtitle="Found a bug? Let us know!"
      topRightContent={
        sessionData && (
          <div className="flex flex-row items-baseline">
            <label className="relative mr-3 inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                value=""
                className="peer sr-only"
                onClick={() => setShowActive((prev) => !prev)}
              />
              <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:top-[3px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300"></div>
              <span className="ml-3 text-base text-gray-900">
                Showing {showActive ? "active" : "solved"}
              </span>
            </label>
            <Button
              id="report"
              label="New Report"
              onClick={(e) => {
                e.preventDefault();
                setShowModal(true);
              }}
            />
          </div>
        )
      }
    >
      <FormProvider {...methods}>
        <form onSubmit={onSubmit}>
          {showModal && sessionData && (
            <Modal
              title="Write a new bug report"
              proceed_label="Submit"
              setIsOpen={setShowModal}
            >
              <div>
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
                        <>
                          Do not know. Please provide details in the
                          description.
                        </>
                      ) : (
                        window.location.origin + "/" + system
                      )}
                    </option>
                  ))}
                </SelectField>
                <RichInput
                  id="description"
                  label="Describe the bug"
                  height="300"
                  placeholder="
                  <p><b>Describe the bug: </b> write here...</p>
                  <p><b>How to reproduce: </b> write here...</p>
                  <p><b>Expected behavior: </b> write here...</p>
                  <p><b>Device Information: </b> mobile/tablet/desktop? browser?</p>"
                  control={control}
                  error={errors.description?.message}
                />
              </div>
            </Modal>
          )}
        </form>
      </FormProvider>

      {allBugs &&
        allBugs.map((bug, i) => (
          <div
            key={bug.id}
            ref={i === allBugs.length - 1 ? setLastElement : null}
          >
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
                          You are about to delete a bug report. Are you sure? If
                          the bug is resolved, it should simply be closed.
                        </Confirm>
                      )}
                    </div>
                  </div>
                }
              >
                <div>
                  {bug.summary}
                  <br />
                  <b>System:</b> {bug.system}, <b>Report by</b>{" "}
                  {bug.user.username} at {bug.createdAt.toLocaleDateString()}
                </div>
              </Post>
            </Link>
          </div>
        ))}
    </ContentBox>
  );
};

export default BugReport;
