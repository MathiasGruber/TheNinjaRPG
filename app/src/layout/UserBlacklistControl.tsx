"use client";

import React from "react";
import { api } from "@/app/_trpc/client";
import UserSearchSelect from "@/layout/UserSearchSelect";
import AvatarImage from "@/layout/Avatar";
import Loader from "@/layout/Loader";
import { Ban, UserPlus } from "lucide-react";
import { Label } from "src/components/ui/label";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSearchValidator } from "@/validators/register";
import { showMutationToast } from "@/libs/toast";
import type { z } from "zod";

const UserBlacklistControl: React.FC = () => {
  // Get react query utility
  const utils = api.useUtils();

  // Query
  const { data } = api.profile.getBlacklist.useQuery(undefined);

  // Mutations
  const { mutate: toggleEntry, isPending } =
    api.profile.toggleBlacklistEntry.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getBlacklist.invalidate();
          await utils.comments.getConversationComments.invalidate();
          await utils.comments.getUserConversations.invalidate();
        }
      },
    });

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // Render
  return (
    <div className="p-3">
      <div className="flex flex-col gap-1">
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          label="Search user to blacklist"
          selectedUsers={[]}
          showYourself={false}
          showAi={false}
          inline={true}
          maxUsers={maxUsers}
        />
        <Button
          className="w-full "
          type="submit"
          onClick={() => toggleEntry({ userId: targetUser?.userId || "" })}
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Add to blacklist
        </Button>
        {isPending && <Loader explanation="Updating blacklist" />}
        {!isPending && data && data.length > 0 && (
          <>
            <Label className="pt-2">Blacklisted members</Label>
            <p className="text-xs italic pb-1">
              Hide their messages, do not show your messages to them
            </p>
            <div className="grid grid-cols-6">
              {data
                ?.filter((u) => u.target)
                .map((user, i) => {
                  return (
                    <div
                      key={`blacklist-${i}`}
                      className="flex flex-col items-center relative text-xs"
                    >
                      <AvatarImage
                        href={user.target.avatar}
                        alt={user.target.username}
                        userId={user.target.userId}
                        hover_effect={false}
                        size={100}
                      />
                      {user.target.username}
                      <Ban
                        className="h-8 w-8 absolute top-0 right-0 bg-red-500 rounded-full p-1 hover:text-orange-500 hover:cursor-pointer"
                        onClick={() =>
                          toggleEntry({ userId: user.target.userId || "" })
                        }
                      />
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UserBlacklistControl;
