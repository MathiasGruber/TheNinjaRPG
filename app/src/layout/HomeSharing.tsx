"use client";

import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "@/layout/Link";

/** Edit home access with its saved revision; refresh after rejection to recover from stale state. */
export const HomeSharing = ({
  isPublic,
  invitations,
  revision,
  userId,
  onChanged,
}: {
  isPublic: boolean;
  invitations: { userId: string; username: string }[];
  revision: number;
  userId: string;
  onChanged: () => Promise<unknown>;
}) => {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const mutation = api.home.setHomeSharing.useMutation();
  /** Show expected mutation feedback beside the action and refresh the shared access snapshot. */
  const change = async (input: {
    isPublic: boolean;
    inviteUsername?: string;
    revokeUserId?: string;
  }) => {
    setMessage("");
    try {
      const result = await mutation.mutateAsync({ ...input, revision });
      setMessage(result.message);
      if (result.success) setUsername("");
      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update home access. Try again.",
      );
    }
  };
  return (
    <section aria-label="Home visitors" className="space-y-3 rounded-lg border p-3">
      <h3 className="font-semibold">Home visitors</h3>
      <p className="text-muted-foreground text-sm">
        {isPublic
          ? "Your home is public. Any signed-in player can view it from your profile."
          : "Your home is private. Only invited players can view it."}{" "}
        Visitors can look around your decorations.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => void change({ isPublic: !isPublic })}
        >
          {isPublic ? "Make private" : "Make public"}
        </Button>
        <Link href={`/home/visit/${encodeURIComponent(userId)}`}>
          <Button variant="outline">Preview home visit</Button>
        </Link>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (username.trim()) void change({ isPublic, inviteUsername: username });
        }}
      >
        <Input
          aria-label="Invite player by username"
          placeholder="Player username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={191}
        />
        <Button disabled={mutation.isPending || !username.trim()} type="submit">
          Invite
        </Button>
      </form>
      {invitations.map((invitation) => (
        <div
          key={invitation.userId}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span>{invitation.username}</span>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Revoke invitation for ${invitation.username}`}
            disabled={mutation.isPending}
            onClick={() => void change({ isPublic, revokeUserId: invitation.userId })}
          >
            Revoke
          </Button>
        </div>
      ))}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
};
