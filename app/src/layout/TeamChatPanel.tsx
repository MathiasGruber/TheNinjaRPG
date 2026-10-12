"use client";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/libs/shadui";
import { showMutationToast } from "@/libs/toast";
import { parseHtml } from "@/utils/parse";
import { useRequiredUserData } from "@/utils/UserContext";

/** Shared raid/quest chat using conversation permissions and live message invalidation. */
export const TeamChatPanel: React.FC<TeamChatPanelProps> = ({
  conversationId,
  title = "Team Chat",
}) => {
  const { data: userData, pusher } = useRequiredUserData();
  const util = api.useUtils();
  const [message, setMessage] = useState("");

  const queryKey = useMemo(
    () => ({
      convo_id: conversationId,
      limit: 15,
    }),
    [conversationId],
  );

  const { data: commentsData, isPending } =
    api.comments.getConversationComments.useInfiniteQuery(queryKey, {
      enabled: !!conversationId,
      // Recheck permissions after missed cross-tab events, even while cached history is fresh.
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

  const { mutate: sendMessage, isPending: isSending } =
    api.comments.createConversationComment.useMutation({
      onSuccess: async (data) => {
        if (!data.success) {
          showMutationToast(data);
          return;
        }

        setMessage("");
        await util.comments.getConversationComments.invalidate(queryKey);
      },
    });

  useEffect(() => {
    if (!pusher || !conversationId) return;

    const channel = pusher.subscribe(conversationId);
    channel.bind("event", (data: { message?: string; fromId?: string }) => {
      // Skip the echo of our own send — onSuccess already invalidated.
      if (data.message === "new" && data.fromId !== userData?.userId) {
        void util.comments.getConversationComments.invalidate(queryKey);
      }
    });

    return () => {
      pusher.unsubscribe(conversationId);
    };
  }, [
    conversationId,
    pusher,
    queryKey,
    userData?.userId,
    util.comments.getConversationComments,
  ]);

  const comments = useMemo(() => {
    if (!commentsData?.pages) return [];
    const seen = new Set<string>();
    return commentsData.pages
      .flatMap((page) => page.data)
      .filter((comment) => {
        if (seen.has(comment.id)) return false;
        seen.add(comment.id);
        return true;
      });
  }, [commentsData?.pages]);
  const restrictionMessage =
    commentsData?.pages[0]?.restrictionMessage ??
    commentsData?.pages[0]?.convo?.sendRestriction;

  /** Validate the draft while retaining it on failure; the conversation router enforces access. */
  const handleSendMessage = () => {
    if (!conversationId || restrictionMessage) return;
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 4) {
      showMutationToast({
        success: false,
        message: "Chat messages must be at least 4 characters long.",
      });
      return;
    }

    sendMessage({
      object_id: conversationId,
      comment: trimmedMessage,
      quoteIds: null,
      senderId: null,
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-medium">{title}</h4>
        <span className="text-muted-foreground text-xs">
          Messages are shared live with your team.
        </span>
      </div>

      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
        {isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chat...
          </div>
        ) : comments.length > 0 ? (
          comments
            .slice()
            .reverse()
            .map((comment) => (
              <div
                key={comment.id}
                className={cn(
                  "rounded-md border bg-background p-2 text-sm",
                  comment.userId === userData?.userId && "border-primary/40",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{comment.username}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(comment.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="break-words text-foreground">
                  {parseHtml(comment.content)}
                </div>
              </div>
            ))
        ) : (
          <p className="text-muted-foreground text-sm">
            {restrictionMessage ?? "No messages yet. Coordinate your team here."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            restrictionMessage ??
            (userData?.isBanned || userData?.isSilenced
              ? "You cannot send messages while banned or silenced."
              : "Write a message to your team...")
          }
          disabled={
            !!restrictionMessage ||
            isSending ||
            userData?.isBanned ||
            userData?.isSilenced
          }
          className="min-h-24"
          maxLength={5000}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {restrictionMessage ?? "Minimum 4 characters."}
          </span>
          <Button
            onClick={handleSendMessage}
            disabled={
              !!restrictionMessage ||
              isSending ||
              userData?.isBanned ||
              userData?.isSilenced ||
              message.trim().length < 4
            }
          >
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface TeamChatPanelProps {
  title?: string;
  conversationId: string;
}
