import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as client from "@/app/_trpc/client";
import { AiSpriteAnimations } from "@/layout/AiSpriteAnimations";
import * as ContentBox from "@/layout/ContentBox";
import * as uploadthing from "@/utils/uploadthing";
import { ensureDom } from "../setup-dom.mjs";

const create = vi.fn();

beforeEach(() => {
  ensureDom();
  vi.clearAllMocks();
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({ spriteAnimation: { getAiConfig: { invalidate: vi.fn() } } }),
    spriteAnimation: {
      getAiConfig: {
        useQuery: () => ({
          data: { actions: [], assignments: [], animations: [] },
          isPending: false,
        }),
      },
      create: { useMutation: () => ({ mutate: create, isPending: false }) },
      assign: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  });
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }) => <>{children}</>);
  vi.spyOn(uploadthing, "UploadButton").mockImplementation(() => <></>);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows invalid sheet feedback and permits correction without losing the draft", async () => {
  const view = render(<AiSpriteAnimations userId="ai" />);
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Movement" } });
  fireEvent.change(view.getByLabelText("Sprite sheet URL"), {
    target: { value: "https://example.com/move.png" },
  });
  fireEvent.input(view.getByLabelText("Rows"), { target: { value: "2" } });
  const form = view.getByRole("button", { name: "Add to animation library" }).closest("form")!;
  fireEvent.submit(form);

  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toBe("Frame count exceeds the sheet grid"),
  );
  expect(create).not.toHaveBeenCalled();
  expect((view.getByLabelText("Name") as HTMLInputElement).value).toBe("Movement");

  fireEvent.input(view.getByLabelText("Frames"), { target: { value: "12" } });
  fireEvent.submit(form);
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledWith({
    name: "Movement",
    url: "https://example.com/move.png",
    columns: 6,
    rows: 2,
    frameCount: 12,
    fps: 12.5,
    facing: "left",
  });
  expect(view.queryByRole("alert")).toBeNull();
});
