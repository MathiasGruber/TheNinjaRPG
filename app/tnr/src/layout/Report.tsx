import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ReactHtmlParser from "react-html-parser";

import Modal from "./Modal";
import RichInput from "./RichInput";
import Post from "./Post";

import { type UserReportSchema, type systems } from "../validators/reports";
import { userReportSchema } from "../validators/reports";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

interface ReportUserProps {
  button: React.ReactNode;
  system: (typeof systems)[number];
  user: {
    userId: string;
    username: string;
    avatar: string | null;
    level: number;
    rank: string;
  };
  content: {
    id: string;
    content?: string;
    title?: string;
    symmary?: string;
  };
}

const ReportUser: React.FC<ReportUserProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);

  const createReport = api.reports.create.useMutation({
    onSuccess: () => {
      show_toast(
        props.user.username + " User Reported",
        "Your report has been submitted. A moderator will review it asap.",
        "info"
      );
    },
    onError: (error) => {
      show_toast("Error on reporting user", error.message, "error");
    },
  });

  const {
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<UserReportSchema>({
    defaultValues: {
      system: props.system,
      system_id: props.content.id,
      reported_userId: props.user.userId,
    },
    resolver: zodResolver(userReportSchema),
  });

  const onSubmit = handleSubmit(
    (data) => {
      createReport.mutate(data);
      reset();
      setShowModal(false);
    },
    (errors) => console.error(errors)
  );

  if (showModal) {
    return (
      <form onSubmit={onSubmit}>
        <Modal
          title="Report User"
          setIsOpen={setShowModal}
          proceed_label="Report User"
          onAccept={onSubmit}
        >
          <Post
            title={props.content.title}
            user={props.user}
            hover_effect={false}
          >
            {props.content.symmary && (
              <div>
                {ReactHtmlParser(props.content.symmary)}
                <hr />
              </div>
            )}
            <hr />
            {props.content.content && (
              <div>
                {ReactHtmlParser(props.content.content)}
                <hr />
              </div>
            )}
          </Post>
          <RichInput
            id="reason"
            label="Report reason"
            height="200"
            placeholder="Unless obvious, please state the reason for this report"
            control={control}
            error={errors.reason?.message}
          />
        </Modal>
      </form>
    );
  } else {
    return (
      <div
        onClick={(e) => {
          e.preventDefault();
          setShowModal(true);
        }}
      >
        {props.button}
      </div>
    );
  }
};

export default ReportUser;
