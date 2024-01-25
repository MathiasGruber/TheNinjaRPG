import { type z } from "zod";
import { useState, useEffect } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import Conversation from "@/layout/Conversation";
import Button from "@/layout/Button";
import RichInput from "@/layout/RichInput";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import InputField from "@/layout/InputField";
import AvatarImage from "@/layout/Avatar";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { PencilSquareIcon, UserGroupIcon, XMarkIcon } from "@heroicons/react/24/solid";

import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";
import { createConversationSchema } from "../validators/comments";
import { type CreateConversationSchema } from "../validators/comments";
import { getSearchValidator } from "../validators/register";

const Inbox: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <div className={`grid grid-cols-4`}>
      <div className={`mr-3  ${selectedConvo ? "col-span-1" : "col-span-3"}`}>
        <ShowConversations
          selectedConvo={selectedConvo}
          setSelectedConvo={setSelectedConvo}
        />
      </div>
      <div className={`${selectedConvo ? "col-span-3" : "col-span-1"}`}>
        {selectedConvo ? (
          <Conversation
            refreshKey={0}
            convo_id={selectedConvo}
            title="Inbox"
            subtitle="Private messages"
            topRightContent={
              <NewConversationPrompt setSelectedConvo={setSelectedConvo} />
            }
          />
        ) : (
          <div className="flex flex-row">
            <div className="grow"></div>
            {<NewConversationPrompt setSelectedConvo={setSelectedConvo} />}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;

/**
 * Component for displaying a conversations
 */
interface ShowConversationsProps {
  selectedConvo?: string | null;
  setSelectedConvo: React.Dispatch<React.SetStateAction<string | null>>;
}
const ShowConversations: React.FC<ShowConversationsProps> = (props) => {
  const { selectedConvo, setSelectedConvo } = props;

  // Fetch conversations. Note we pass the selected convo to automatically re-fetch when it changes
  const {
    data: allConversations,
    refetch,
    isLoading,
  } = api.comments.getUserConversations.useQuery({ selectedConvo: selectedConvo });

  useEffect(() => {
    if (!isLoading) {
      const firstConvo = allConversations?.[0];
      if (selectedConvo && !allConversations?.find((c) => c.id === selectedConvo)) {
        setSelectedConvo(firstConvo ? firstConvo.id : null);
      }
      if (selectedConvo === null && firstConvo) {
        setSelectedConvo(firstConvo.id);
      }
    }
  }, [isLoading, selectedConvo, allConversations, setSelectedConvo]);

  const { mutate: exitConversation } = api.comments.exitConversation.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on exiting conversation", error.message, "error");
    },
  });
  return (
    <div>
      {isLoading && <Loader explanation="Looking for conversations" />}
      {allConversations && (
        <div className="relative overflow-y-auto">
          <ul className="space-y-2">
            <li>
              <a
                href="#"
                className="flex items-center rounded-lg p-2 text-base font-normal"
              >
                {selectedConvo ? (
                  <XMarkIcon
                    className="h-6 w-6 hover:fill-orange-500"
                    onClick={() => setSelectedConvo(null)}
                  />
                ) : (
                  <UserGroupIcon className="h-6 w-6" />
                )}
                <span className="... ml-3 truncate font-bold">Chats</span>
              </a>
              <hr />
              {allConversations.map((convo) => (
                <div
                  className={`my-3 flex h-12 flex-row items-center rounded-lg p-1 hover:bg-orange-200 ${
                    selectedConvo && selectedConvo === convo.id ? "bg-orange-200" : ""
                  }`}
                  key={convo.id}
                  onClick={() => setSelectedConvo(convo.id)}
                >
                  {convo.users.length > 0 &&
                    convo.users.map((relation, i) => {
                      const user = relation.userData;
                      return (
                        <div
                          key={user.userId}
                          className={`absolute w-14`}
                          style={{ left: `${i * 2}rem` }}
                        >
                          <AvatarImage
                            href={user.avatar}
                            userId={user.userId}
                            alt={user.username}
                            size={50}
                            priority
                          />
                        </div>
                      );
                    })}
                  <span
                    className="... truncate text-sm"
                    style={{
                      marginLeft: (convo.users.length * 2 + 1.5).toString() + "rem",
                    }}
                  >
                    {convo.title}
                    <br />
                    {convo.createdAt.toDateString()}s
                  </span>
                  <div className="grow"></div>
                  <XMarkIcon
                    className="ml-2 h-6 w-6 cursor-pointer rounded-full hover:fill-orange-500"
                    onClick={(e) => {
                      e.preventDefault();
                      exitConversation({ convo_id: convo.id });
                    }}
                  />
                </div>
              ))}
            </li>
          </ul>
          <span className="italic">- Messages deleted after 14 days</span>
        </div>
      )}
    </div>
  );
};

/**
 * Component for creating a new conversation
 */
interface NewConversationPromptProps {
  setSelectedConvo: React.Dispatch<React.SetStateAction<string | null>>;
}

const NewConversationPrompt: React.FC<NewConversationPromptProps> = (props) => {
  const { data: userData } = useRequiredUserData();
  const maxUsers = 5;

  const create = useForm<CreateConversationSchema>({
    resolver: zodResolver(createConversationSchema),
  });

  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });

  const users = userSearchMethods.watch("users");
  useEffect(() => {
    if (users && users.length > 0) {
      create.setValue(
        "users",
        users.map((u) => u.userId),
      );
    }
  }, [users, create]);

  const createConversation = api.comments.createConversation.useMutation({
    onSuccess: (data) => {
      create.reset();
      props.setSelectedConvo(data.conversationId);
    },
    onError: (error) => {
      show_toast("Error on creating new conversation", error.message, "error");
    },
  });

  const onSubmit = create.handleSubmit(
    (data) => {
      createConversation.mutate(data);
    },
    (error) => console.error(error),
  );

  return (
    <div className="flex flex-row items-center">
      {userData && !userData.isBanned && (
        <Confirm
          title="Create a new conversation"
          proceed_label="Submit"
          isValid={create.formState.isValid}
          button={
            <Button
              id="conversation"
              label="New"
              image={<PencilSquareIcon className="mr-2 h-5 w-5" />}
            />
          }
          onAccept={onSubmit}
        >
          <UserSearchSelect
            useFormMethods={userSearchMethods}
            label="Users to send to"
            showYourself={false}
            maxUsers={maxUsers}
          />

          <InputField
            id="title"
            label="Conversation name"
            register={create.register}
            error={create.formState.errors.title?.message}
          />
          <RichInput
            id="comment"
            label="Initial conversation message"
            height="300"
            placeholder=""
            control={create.control}
            error={create.formState.errors.comment?.message}
          />
        </Confirm>
      )}
    </div>
  );
};
