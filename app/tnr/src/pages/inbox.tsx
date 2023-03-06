import { useState, useEffect } from "react";
import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import Conversation from "../layout/Conversation";
import Button from "../layout/Button";
import RichInput from "../layout/RichInput";
import Confirm from "../layout/Confirm";
import InputField from "../layout/InputField";
import AvatarImage from "../layout/Avatar";
import {
  PencilSquareIcon,
  Bars4Icon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { getUnique } from "../utils/grouping";
import { useRequiredUser } from "../utils/UserContext";
import { useInfinitePagination } from "../libs/pagination";
import { createConversationSchema } from "../validators/comments";
import { type CreateConversationSchema } from "../validators/comments";

const Tavern: NextPage = () => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showConversations, setShowConversations] = useState(true);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<
    {
      username: string;
      avatar: string | null;
      userId: string;
    }[]
  >([]);
  const { data: sessionData } = useSession();
  const { data: userData } = useRequiredUser();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<CreateConversationSchema>({
    resolver: zodResolver(createConversationSchema),
  });

  const watchUsername = watch("username", "");

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(watchUsername);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchUsername, setSearchTerm]);

  const {
    data: conversations,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = api.comments.getUserConversations.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allConversations = conversations?.pages.map((page) => page.data).flat();

  useEffect(() => {
    if (selectedConvo && !allConversations?.find((c) => c.id === selectedConvo)) {
      setSelectedConvo(null);
    }
  }, [selectedConvo, allConversations]);

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const { data: searchResults } = api.profile.searchUsers.useQuery(
    { username: searchTerm },
    {
      enabled: searchTerm !== "",
    }
  );

  const createConversation = api.comments.createConversation.useMutation({
    onSuccess: async () => {
      reset();
      setSelectedUsers([]);
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating new conversation", error.message, "error");
    },
  });

  const exitConversation = api.comments.exitConversation.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on exiting conversation", error.message, "error");
    },
  });

  const onSubmit = handleSubmit(
    (data) => {
      console.log(data);
      createConversation.mutate(data);
    },
    (error) => console.log(error)
  );

  const topRightContent = sessionData && (
    <div className="flex flex-row items-center">
      {userData && !sessionData.user?.isBanned && (
        <Confirm
          title="Create a new conversation"
          proceed_label="Submit"
          isValid={isValid}
          button={
            <Button
              id="conversation"
              label="New"
              image={<PencilSquareIcon className="mr-2 h-5 w-5" />}
            />
          }
          onAccept={onSubmit}
        >
          <InputField
            id="username"
            label="Users to send to"
            register={register}
            error={errors.username ? errors.username?.message : errors.users?.message}
            placeholder="Search for user"
            options={
              <>
                {searchResults && watchUsername && (
                  <div className="relative z-50 my-0.5 block w-full rounded-lg border-2 border-slate-500 bg-slate-100">
                    {searchResults?.map((user) => (
                      <div
                        className="flex flex-row items-center p-2.5 hover:bg-slate-200"
                        key={user.userId}
                        onClick={(e) => {
                          e.preventDefault();
                          const newSelected = getUnique(
                            [...selectedUsers, user],
                            "userId"
                          );
                          setSelectedUsers(newSelected);
                          setValue("username", "");
                          setValue(
                            "users",
                            newSelected.map((e) => e.userId)
                          );
                        }}
                      >
                        <div className="basis-1/12">
                          <AvatarImage
                            href={user.avatar}
                            alt={user.username}
                            size={100}
                            priority
                          />
                        </div>
                        <div className="ml-2">
                          <p>{user.username}</p>
                          <p>
                            Lvl. {user.level} {user.rank}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedUsers.map((user) => (
                  <span
                    key={user.userId}
                    className="mr-2 mt-1 inline-flex items-center rounded-lg  bg-gray-100 px-2 py-1 text-sm font-medium text-gray-800"
                  >
                    <div className="m-1 w-10">
                      <AvatarImage
                        href={user.avatar}
                        alt={user.username}
                        size={100}
                        priority
                      />
                    </div>
                    {user.username}
                    <XMarkIcon
                      className="ml-2 h-6 w-6 rounded-full hover:bg-gray-300"
                      onClick={(e) => {
                        e.preventDefault();
                        const newSelected = getUnique(
                          selectedUsers.filter((e) => e.userId !== user.userId),
                          "userId"
                        );
                        setSelectedUsers(newSelected);
                        setValue(
                          "users",
                          newSelected.map((e) => e.userId)
                        );
                      }}
                    />
                  </span>
                ))}
              </>
            }
          />

          <InputField
            id="title"
            label="Conversation name"
            register={register}
            error={errors.title?.message}
          />
          <RichInput
            id="comment"
            label="Initial conversation message"
            height="300"
            placeholder=""
            control={control}
            error={errors.comment?.message}
          />
        </Confirm>
      )}
    </div>
  );

  return (
    <div className={`grid grid-cols-4`}>
      {showConversations ? (
        allConversations && (
          <div className={`mr-3  ${selectedConvo ? "col-span-1" : "col-span-3"}`}>
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
                  {allConversations.map((convo, i) => (
                    <div
                      className={`my-3 flex h-12 flex-row items-center rounded-lg p-1 hover:bg-orange-200 ${
                        selectedConvo && selectedConvo === convo.id
                          ? "bg-orange-200"
                          : ""
                      }`}
                      ref={i === allConversations.length - 1 ? setLastElement : null}
                      key={convo.id}
                      onClick={() => setSelectedConvo(convo.id)}
                    >
                      {convo.UsersInConversation.length > 0 &&
                        convo.UsersInConversation.map((user, i) => (
                          <div
                            key={user.userId}
                            className={`absolute w-14`}
                            style={{ left: `${i * 2}rem` }}
                          >
                            <AvatarImage
                              href={user.user.avatar}
                              alt={user.user.username}
                              size={50}
                              priority
                            />
                          </div>
                        ))}
                      <span
                        className="... truncate text-sm"
                        style={{
                          marginLeft:
                            (convo.UsersInConversation.length * 2 + 1.5).toString() +
                            "rem",
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
                          exitConversation.mutate({ convo_id: convo.id });
                        }}
                      />
                    </div>
                  ))}
                </li>
              </ul>
              <span className="italic">- Messages deleted after 14 days</span>
            </div>
          </div>
        )
      ) : (
        <Bars4Icon
          className="mr-3 h-9 w-9 hover:fill-orange-500"
          onClick={() => setShowConversations((prev) => !prev)}
        />
      )}
      <div className={`${selectedConvo ? "col-span-3" : "col-span-1"}`}>
        {selectedConvo ? (
          <Conversation
            refreshKey={0}
            convo_id={selectedConvo}
            title="Conversation"
            subtitle="Broadcast across all villages."
            topRightContent={topRightContent}
          />
        ) : (
          <div className="flex flex-row">
            <div className="grow"></div>
            {topRightContent}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tavern;
