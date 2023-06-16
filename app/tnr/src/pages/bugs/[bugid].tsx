import { useState } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";

import ReactHtmlParser from "react-html-parser";
import { CheckIcon } from "@heroicons/react/24/solid";

import Button from "../../layout/Button";
import ContentBox from "../../layout/ContentBox";
import Post from "../../layout/Post";

import Conversation from "../../layout/Conversation";

import { api } from "../../utils/api";
import { useUserData } from "../../utils/UserContext";
import { show_toast } from "../../libs/toast";

const BugReport: NextPage = () => {
  const { data: userData } = useUserData();
  const [conversationKey, setConversationKey] = useState<number>(0);
  const router = useRouter();
  const bug_id = router.query.bugid as string;

  const { data: bug, refetch: refetchBug } = api.bugs.get.useQuery(
    { id: bug_id },
    { enabled: bug_id !== undefined }
  );

  const resolveComment = api.bugs.resolve.useMutation({
    onSuccess: async () => {
      await refetchBug();
      setConversationKey((prev) => prev + 1);
    },
    onError: (error) => {
      show_toast("Error on resolving report", error.message, "error");
    },
  });

  return (
    <>
      {bug && (
        <>
          <ContentBox
            title="Report Bugs"
            back_href="/bugs"
            subtitle="Details about bug report"
          >
            <Post title={"Summary: " + bug.title} user={bug.user} hover_effect={false}>
              <b>System:</b> {bug.system}
              <hr />
              {bug.summary}
            </Post>
            <Post title="Report Details" hover_effect={false}>
              {ReactHtmlParser(bug.content)}
              {userData?.role === "ADMIN" && (
                <>
                  <div className="grow"></div>
                  <Button
                    id="submit_resolve"
                    label={bug.isResolved ? "Unresolve" : "Resolve"}
                    color={bug.isResolved ? "red" : "green"}
                    image={<CheckIcon className="mr-1 h-5 w-5" />}
                    onClick={() => {
                      resolveComment.mutate({ id: bug.id });
                    }}
                  />
                </>
              )}
            </Post>
          </ContentBox>
          <Conversation
            refreshKey={conversationKey}
            convo_id={bug.conversationId}
            title={"Bug Discussion"}
            subtitle="Related information & discussion"
          />
        </>
      )}
    </>
  );
};

export default BugReport;
