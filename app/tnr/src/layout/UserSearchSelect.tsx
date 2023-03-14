import React from "react";
import { useState, useEffect } from "react";
import { type FederalStatus } from "@prisma/client";

import InputField from "./InputField";
import AvatarImage from "./Avatar";
import { XMarkIcon } from "@heroicons/react/24/solid";

import { type UseFormReturn } from "react-hook-form";
import { getUnique } from "../utils/grouping";
import { api } from "../utils/api";

type SelectedUser = {
  username: string;
  avatar: string | null;
  federalStatus: FederalStatus;
  userId: string;
};

interface UserSearchSelectProps {
  useFormMethods: UseFormReturn<
    {
      username: string;
      users: {
        userId: string;
        username: string;
        rank: string;
        level: number;
        avatar?: string | null;
        federalStatus: FederalStatus;
      }[];
    },
    any
  >;
  selectedUsers?: SelectedUser[];
  showYourself: boolean;
  label?: string;
  inline?: boolean;
  maxUsers?: number;
}

const UserSearchSelect: React.FC<UserSearchSelectProps> = (props) => {
  const [searchTerm, setSearchTerm] = useState("");

  const {
    watch,
    register,
    setValue,
    formState: { errors },
  } = props.useFormMethods;

  const watchUsername = watch("username", "");
  const watchUsers = watch("users", []);

  const { data: searchResults } = api.profile.searchUsers.useQuery(
    { username: searchTerm, showYourself: props.showYourself },
    { enabled: searchTerm !== "" }
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(watchUsername);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchUsername, setSearchTerm]);

  const selectedVisual = watchUsers.map((user) => (
    <span
      key={user.userId}
      className="my-1 mr-2 inline-flex items-center rounded-lg border  border-amber-900 bg-gray-100 px-2 text-sm font-medium text-gray-800"
    >
      <div className="m-1 w-10">
        <AvatarImage href={user.avatar} alt={user.username} size={100} priority />
      </div>
      {user.username}
      <XMarkIcon
        className="ml-2 h-6 w-6 rounded-full hover:bg-gray-300"
        onClick={(e) => {
          e.preventDefault();
          const newSelected = getUnique(
            watchUsers.filter((e) => e.userId !== user.userId),
            "userId"
          );
          setValue("users", newSelected);
        }}
      />
    </span>
  ));

  return (
    <div className="flex flex-row items-center">
      <InputField
        id="username"
        label={props.label}
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
                      let newSelected = getUnique([...watchUsers, user], "userId");
                      if (props.maxUsers && newSelected.length > props.maxUsers) {
                        newSelected = newSelected.slice(1);
                      }
                      setValue("username", "");
                      setValue("users", newSelected);
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
            {!props.inline && selectedVisual}
          </>
        }
      />
      {props.inline && selectedVisual}
    </div>
  );
};

export default UserSearchSelect;
