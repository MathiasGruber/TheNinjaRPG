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
import IconThumbsUp from "../layout/IconThumbsUp";
import IconThumbsDown from "../layout/IconThumbsDown";
import Modal from "../layout/Modal";
import Post from "../layout/Post";
import { api } from "../utils/api";
import { systems } from "../validators/bugs";
import { type BugreportSchema } from "../validators/bugs";
import { bugreportSchema } from "../validators/bugs";
import { show_toast } from "../libs/toast";

const BugReport: NextPage = () => {
  const { data: bugs, refetch: refetchBugs } = api.bugs.getAll.useQuery();

  const createReport = api.bugs.create.useMutation({
    onSuccess: async () => {
      await refetchBugs();
    },
    onError: (error) => {
      show_toast("Error on fetching latest bugs", error.message, "error");
    },
  });

  const createUpvote = api.bugs.upvote.useMutation({
    onSuccess: async () => {
      await refetchBugs();
    },
    onError: (error) => {
      show_toast("Error on upvoting bug", error.message, "error");
    },
  });

  const createDownvote = api.bugs.downvote.useMutation({
    onSuccess: async () => {
      await refetchBugs();
    },
    onError: (error) => {
      show_toast("Error on upvoting bug", error.message, "error");
    },
  });
  const [showModal, setShowModal] = useState<boolean>(false);
  // User data
  const { data: sessionData } = useSession();
  // Form handling
  const methods = useForm<BugreportSchema>({
    resolver: zodResolver(bugreportSchema),
  });
  // Destruct methods
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = methods;
  // Handle form submit
  const onSubmit = handleSubmit(async (data) => {
    console.log("Calling onsubmit");
    createReport.mutate(data);
    await refetchBugs();
    setShowModal(false);
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit}>
        <ContentBox
          title="Report Bugs"
          subtitle="Found a bug? Let us know!"
          topRightContent={
            sessionData && (
              <Button
                id="report"
                label="New Report"
                onClick={(e) => {
                  e.preventDefault();
                  setShowModal(true);
                }}
              />
            )
          }
        >
          {showModal && sessionData && (
            <Modal
              title="Write a new bug report"
              form="report_bug"
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

          {bugs &&
            bugs.map((bug) => (
              <Link key={bug.id} href={"/bugs/" + bug.id}>
                <Post
                  title={bug.title}
                  options={
                    <div className="flex flex-col items-center">
                      <p className="text-2xl font-bold">{bug._count.votes}</p>
                      <p className="">votes</p>
                      <div className="flex flex-row">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            createDownvote.mutate({ id: bug.id });
                          }}
                        >
                          <IconThumbsDown />
                        </div>
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            createUpvote.mutate({ id: bug.id });
                          }}
                        >
                          <IconThumbsUp />
                        </div>
                      </div>
                    </div>
                  }
                >
                  <div>
                    {bug.summary}
                    <br />
                    <b>System:</b> {bug.system}, <b>Report by</b>{" "}
                    {bug.user.username}
                  </div>
                </Post>
              </Link>
            ))}
        </ContentBox>
      </form>
    </FormProvider>
  );
};

export default BugReport;
