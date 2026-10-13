import { sendGTMEvent } from "@next/third-parties/google";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import Confirm from "@/layout/Confirm";
import Countdown from "@/layout/Countdown";
import { cn } from "@/libs/shadui";
import { showMutationToast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";

interface DeleteUserButtonProps {
  className?: string;
  label?: string;
  userData: {
    userId: string;
    deletionAt: Date | null;
  };
}

const DeleteUserButton: React.FC<DeleteUserButtonProps> = (props) => {
  // Destructure
  const { userData } = props;

  // Global state
  const { timeDiff } = useRequiredUserData();

  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useRouter();

  // Mutations
  const { mutate: confirmDeletion, isPending: isDeleting } =
    api.profile.confirmDeletion.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          // Clerk intentionally remains signed in after character deletion. Remove the
          // cached profile immediately: NativeStore closes checkout and NativeBridge's
          // missing-profile path clears push/widget/purchase/activity state before the
          // invalidation round-trip completes.
          utils.profile.getUser.setData(undefined, (current) =>
            current ? { ...current, userData: undefined } : current,
          );
          await Promise.all([
            utils.profile.getUser.invalidate(),
            utils.profile.getPublicUser.invalidate(),
          ]);
          router.push("/");
        }
      },
    });

  const { mutate: toggleDeletionTimer, isPending: isTogglingDelete } =
    api.profile.toggleDeletionTimer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          sendGTMEvent({
            event: "toggle_deletion",
            character: userData.userId,
          });
          await Promise.all([
            utils.profile.getUser.invalidate(),
            utils.profile.getPublicUser.invalidate(),
          ]);
        }
      },
    });

  // Derived
  const canDelete = userData?.deletionAt && new Date(userData.deletionAt) < new Date();

  if (isTogglingDelete || isDeleting) {
    return (
      <span
        className={cn("inline-flex items-center", props.className)}
        aria-busy="true"
      >
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="sr-only">Updating character deletion</span>
      </span>
    );
  }

  return (
    <Confirm
      title="Confirm Deletion"
      button={
        <span
          className={cn("inline-flex items-center", props.className)}
          title={props.label ?? "Delete character"}
        >
          <Trash2
            className={`h-6 w-6 cursor-pointer hover:text-orange-500 ${userData.deletionAt ? "animate-pulse text-red-500" : ""}`}
          />
          {props.label ? (
            <span>{props.label}</span>
          ) : (
            <span className="sr-only">Delete character</span>
          )}
        </span>
      }
      proceed_label={
        canDelete
          ? "Complete Deletion"
          : userData.deletionAt
            ? "Disable Deletion Timer"
            : "Enable Deletion Timer"
      }
      onAccept={(e) => {
        e.preventDefault();
        if (canDelete) {
          confirmDeletion({ userId: userData.userId });
        } else {
          toggleDeletionTimer({ userId: userData.userId });
        }
      }}
    >
      <span>
        This feature is intended for marking the character for deletion. Toggling this
        feature enables a timer of 2 days, after which you will be able to delete the
        character - this is to ensure no un-intentional character deletion.
        <p className="py-3 text-muted-foreground text-sm">
          A character with an active ban or silence can be deleted too. To enforce the
          sanction, a minimal record (the account identifier, hashed sign-in
          identifiers, the sanction type, its end date and a reference to the moderation
          case) is kept until the sanction ends, and a new character for the same
          account serves the remaining time.
        </p>
        {userData.deletionAt && (
          <Button
            id="create"
            disabled={userData.deletionAt > new Date()}
            className="mt-3 w-full"
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              if (userData.deletionAt) {
                toggleDeletionTimer({ userId: userData.userId });
              }
            }}
          >
            {userData.deletionAt < new Date() ? (
              "Disable Deletion Timer"
            ) : (
              <Countdown targetDate={userData.deletionAt} timeDiff={timeDiff} />
            )}
          </Button>
        )}
      </span>
    </Confirm>
  );
};

export default DeleteUserButton;
