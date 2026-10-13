import { ensureDom } from "../setup-dom.mjs";
const { cleanup, fireEvent, render } = await import("@testing-library/react");
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { ComponentProps } from "react";
import * as ContentImageSelector from "@/layout/ContentImageSelector";
import { FurnitureViewsEditor } from "@/layout/FurnitureViewsEditor";
import * as Image from "@/layout/Image";
import { FURNITURE_IMAGE_PROMPT } from "@/libs/imagePrompts";
import type { FurnitureViews } from "@/validators/itemFurniture";

type SelectorProps = ComponentProps<typeof ContentImageSelector.default>;
let selector: SelectorProps;
const original = "https://example.com/original.webp";
const turns: FurnitureViews = {
  "90": { image: "https://example.com/90.webp", width: 17, groundAnchor: 86 },
  "180": { image: "https://example.com/180.webp", width: 29, groundAnchor: 93 },
};
const onBaseChange = vi.fn();
const onViewsChange = vi.fn();
const props: ComponentProps<typeof FurnitureViewsEditor> = {
  id: "tea-table",
  name: "Tea table",
  description: "Two cups and a pot",
  image: original,
  width: 30,
  groundAnchor: 90,
  views: turns,
  onBaseChange,
  onViewsChange,
  canEdit: true,
};

beforeEach(() => {
  ensureDom();
  vi.clearAllMocks();
  // Capture the shared selector contract without generating or uploading external media.
  vi.spyOn(ContentImageSelector, "default").mockImplementation((next) => {
    selector = next;
    return <span>{next.label}</span>;
  });
  vi.spyOn(Image, "default").mockImplementation(
    ({ src, alt, style }) => (
      // biome-ignore lint/performance/noImgElement: isolated furniture preview stub
      <img src={typeof src === "string" ? src : undefined} alt={alt} style={style} />
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Select a real tab while keeping the test focused on the editor's view changes. */
const selectTurn = (view: ReturnType<typeof render>, degrees: number) => {
  fireEvent.mouseDown(view.getByRole("tab", { name: new RegExp(`${degrees}°$`) }), {
    button: 0,
    ctrlKey: false,
  });
};

describe("furniture directional content editor", () => {
  it("uses the canonical original, fixed-camera prompt and intended framing for every turn", () => {
    const view = render(<FurnitureViewsEditor {...props} />);
    expect(selector.referenceImageUrl).toBeUndefined();
    expect(selector.imageUrl).toBe(original);
    expect(selector.preprompt).toBe(FURNITURE_IMAGE_PROMPT);
    expect(selector.provider).toBe("OPENAI");
    expect(selector.prompt).toBe("Tea table Two cups and a pot");

    for (const degrees of [90, 180, 270]) {
      selectTurn(view, degrees);
      expect(selector.referenceImageUrl).toBe(original);
      expect(selector.id).toBe(`tea-table:furniture:${degrees}`);
      expect(selector.preprompt).toBe(FURNITURE_IMAGE_PROMPT);
      expect(selector.provider).toBe("OPENAI");
      expect(selector.prompt).toContain(`${degrees} degrees clockwise`);
      expect(selector.prompt).toContain("original 0-degree image");
      expect(selector.prompt).toContain("Keep the camera");
      expect(selector.size).toBe(degrees === 180 ? "landscape" : "portrait");
      expect(selector.maxDim).toBe(768);
    }
  });

  it("adds an incomplete direction without replacing existing views or their framing", () => {
    const view = render(<FurnitureViewsEditor {...props} />);
    selectTurn(view, 270);
    expect(selector.imageUrl).toBeUndefined();
    expect(selector.emptyImageLabel).toBe("Generate or upload this view");
    expect(view.getByText("Generate or upload this view.")).toBeTruthy();
    selector.onUploadComplete("https://example.com/270.webp");
    expect(onViewsChange).toHaveBeenCalledWith({
      ...turns,
      "270": { image: "https://example.com/270.webp" },
    });
    expect(onBaseChange).not.toHaveBeenCalled();
  });

  it("replaces only the selected image and removes only the selected direction", () => {
    const view = render(<FurnitureViewsEditor {...props} />);
    selectTurn(view, 90);
    selector.onUploadComplete("https://example.com/corrected.webp");
    expect(onViewsChange).toHaveBeenLastCalledWith({
      ...turns,
      "90": { ...turns["90"], image: "https://example.com/corrected.webp" },
    });
    fireEvent.click(view.getByRole("button", { name: "Remove this view" }));
    expect(onViewsChange).toHaveBeenLastCalledWith({ "180": turns["180"] });
    expect(onBaseChange).not.toHaveBeenCalled();
  });

  it("keeps per-view footprint and floor anchor independent of the original", () => {
    const view = render(<FurnitureViewsEditor {...props} />);
    selectTurn(view, 90);
    const preview = view.getByRole("img", { name: "90° furniture scene preview" });
    const placed = preview.querySelector<HTMLDivElement>("div[style]");
    expect(placed?.style.width).toBe("17%");
    expect(placed?.style.transform).toBe("translate(-50%, -86%)");
    fireEvent.input(view.getByRole("spinbutton", { name: "Scene width (%)" }), {
      target: { value: "19.5" },
    });
    expect(onViewsChange).toHaveBeenLastCalledWith({
      ...turns,
      "90": { ...turns["90"], width: 19.5 },
    });
    fireEvent.input(view.getByRole("spinbutton", { name: "Ground anchor (%)" }), {
      target: { value: "88" },
    });
    expect(onViewsChange).toHaveBeenLastCalledWith({
      ...turns,
      "90": { ...turns["90"], groundAnchor: 88 },
    });
    expect(onBaseChange).not.toHaveBeenCalled();
  });

  it("edits canonical geometry and image through the original fields", () => {
    const view = render(<FurnitureViewsEditor {...props} />);
    fireEvent.input(view.getByRole("spinbutton", { name: "Scene width (%)" }), {
      target: { value: "32" },
    });
    expect(onBaseChange).toHaveBeenLastCalledWith({ width: 32 });
    selector.onUploadComplete("https://example.com/new-original.webp");
    expect(onBaseChange).toHaveBeenLastCalledWith({
      image: "https://example.com/new-original.webp",
    });
    expect(onViewsChange).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Remove this view" })).toBeNull();
  });

  it("requires an original before creating a turn and exposes recoverable missing-view feedback", () => {
    const view = render(<FurnitureViewsEditor {...props} image="" views={{}} />);
    selectTurn(view, 90);
    expect(selector.disabled).toBe(true);
    expect(selector.referenceImageUrl).toBeUndefined();
    expect(view.getByText("Create the original image first.")).toBeTruthy();
    expect(view.queryByRole("spinbutton")).toBeNull();
  });

  it.each([{ disabled: true }, { canEdit: false }])(
    "blocks image and framing changes while unavailable: %j",
    (unavailable) => {
      const view = render(<FurnitureViewsEditor {...props} {...unavailable} />);
      selectTurn(view, 90);
      expect(selector.disabled).toBe(true);
      selector.onUploadComplete("https://example.com/stale.webp");
      fireEvent.input(view.getByRole("spinbutton", { name: "Scene width (%)" }), {
        target: { value: "20" },
      });
      fireEvent.click(view.queryByRole("button", { name: "Remove this view" }) ??
        view.getByRole("tab", { name: "90°" }));
      expect(onViewsChange).not.toHaveBeenCalled();
      expect(onBaseChange).not.toHaveBeenCalled();
    },
  );
});
