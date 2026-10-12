import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { ReactNode } from "react";
import { type Control, useController } from "react-hook-form";
import { CommentOnConversation } from "@/layout/Comment";
import * as Confirm from "@/layout/Confirm";
import type { PostProps } from "@/layout/Post";
import type { MutateCommentSchema } from "@/validators/comments";
import { ensureDom } from "../setup-dom.mjs";
import { createToastMock } from "../setup/toastMock";

const edit = vi.fn();
vi.mock("@/app/_trpc/client", () => ({
  api: {
    useUtils: () => ({ comments: { getConversationComments: { invalidate: vi.fn() } } }),
    comments: {
      editConversationComment: { useMutation: () => ({ mutate: edit, isPending: false }) },
      deleteConversationComment: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock("@/utils/UserContext", () => ({ useUserData: () => ({ data: { userId: "friend", role: "USER" } }) }));
vi.mock("@/libs/toast", createToastMock);
vi.mock("@/layout/Post", () => ({
  default: ({ children, options }: { children: ReactNode; options?: ReactNode }) => <div>{options}{children}</div>,
}));
vi.mock("@/layout/RichInput", () => ({
  default: ({ control, disabled }: { control: Control<MutateCommentSchema>; disabled?: boolean }) => {
    const { field } = useController({ control, name: "comment" });
    return <><textarea aria-label="Edit message" {...field} disabled={disabled} /><button type="submit" disabled={disabled}>Save message</button></>;
  },
}));
vi.mock("@/layout/ModerationSummary", () => ({ ModerationSummary: () => null }));
vi.mock("@/layout/Report", () => ({ default: () => null }));
vi.mock("@/layout/EmojiPicker", () => ({ default: () => null }));

let confirmSpy: { mockRestore: () => void };
beforeEach(() => {
  ensureDom();
  vi.clearAllMocks();
  confirmSpy = vi.spyOn(Confirm, "default").mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  confirmSpy.mockRestore();
});

const comment = {
  id: "message", conversationId: "conversation", content: "Saved message",
  userId: "friend", authorId: "friend", createdAt: new Date(), reactions: {},
  isPinned: false, isReported: false, isStaffOnly: false,
};
const user: PostProps["user"] = {
  userId: "friend", username: "Friend", avatar: null, level: 50, rank: "GENIN",
  isOutlaw: false, role: "USER", federalStatus: "NONE",
};
const message = (canEdit?: boolean) => <CommentOnConversation comment={comment} user={user} canEdit={canEdit}>{comment.content}</CommentOnConversation>;
const toggleEdit = (view: ReturnType<typeof render>) => {
  const toggle = view.container.querySelector(".lucide-square-pen");
  expect(toggle).not.toBeNull();
  fireEvent.click(toggle!);
};

describe("conversation comment editing permissions", () => {
  it("shows the saved message when an open editor loses permission and retains the draft for recovery", () => {
    const view = render(message(true));
    toggleEdit(view);
    fireEvent.change(view.getByRole("textbox", { name: "Edit message" }), { target: { value: "Unsent draft" } });

    view.rerender(message(false));
    expect(view.queryByRole("textbox", { name: "Edit message" }) === null).toBe(true);
    expect(view.queryByRole("button", { name: "Save message" }) === null).toBe(true);
    expect(view.container.querySelector(".lucide-square-pen") === null).toBe(true);
    expect(view.getByText(comment.content)).toBeTruthy();
    expect(edit).not.toHaveBeenCalled();

    view.rerender(message(true));
    expect((view.getByRole("textbox", { name: "Edit message" }) as HTMLTextAreaElement).value).toBe("Unsent draft");
    toggleEdit(view);
    expect(view.queryByRole("textbox", { name: "Edit message" }) === null).toBe(true);
    expect(view.getByText(comment.content)).toBeTruthy();
  });

  it("keeps normal editing and submission available when permission is omitted", async () => {
    const view = render(message());
    toggleEdit(view);
    fireEvent.change(view.getByRole("textbox", { name: "Edit message" }), { target: { value: "Edited message" } });
    fireEvent.click(view.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit).toHaveBeenCalledWith({ object_id: comment.id, comment: "Edited message", quoteIds: null, senderId: null });
  });
});
