import { ensureDom } from "../setup-dom.mjs";
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { existsSync } from "node:fs";
import { type ImgHTMLAttributes, type AnchorHTMLAttributes, type ComponentProps, useState } from "react";
import { HomeTypes, HomeTypeDetails } from "@/drizzle/constants";
import { HomeScene, HOME_SCENE_IMAGES } from "@/layout/HomeScene";
import { getDefaultHomeLayout } from "@/libs/home";

// Wrapper stubs isolate the scene's routing destinations and image-failure handling.
vi.mock("@/layout/Image", () => ({
  default: ({ src, alt, onError }: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: isolated image-failure test stub
    <img src={src} alt={alt} onError={onError} />
  ),
}));
vi.mock("@/layout/Link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const props = {
  homeType: "NONE" as const,
  isGuest: false,
  isAsleep: false,
  isTogglingSleep: false,
  onSleep: vi.fn(),
  onStorage: vi.fn(),
  onManage: vi.fn(),
  onFarm: vi.fn(),
};

/** Regression coverage for residence navigation, owner access, and artwork recovery. */
describe("Home scene", () => {
  beforeEach(() => {
    ensureDom();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("ships distinct artwork for every existing home tier", () => {
    expect(new Set(Object.values(HOME_SCENE_IMAGES)).size).toBe(HomeTypes.length);
    for (const tier of HomeTypes) {
      expect(existsSync(`public${HOME_SCENE_IMAGES[tier]}`)).toBe(true);
    }
  });

  it("opens home actions and links to the existing kitchen and farm destinations", () => {
    const view = render(<HomeScene {...props} />);
    const scene = within(view.getByRole("group", { name: "Home scene" }));
    fireEvent.click(scene.getByRole("button", { name: "Bed: Go to sleep" }));
    fireEvent.click(scene.getByRole("button", { name: "Armory: Open home storage" }));
    fireEvent.click(view.getByRole("button", { name: "Manage home" }));
    expect(props.onSleep).toHaveBeenCalledTimes(1);
    expect(props.onStorage).toHaveBeenCalledTimes(1);
    expect(props.onManage).toHaveBeenCalledTimes(1);
    expect(scene.getByRole("link", { name: "Kitchen: Visit ramen shop" }).getAttribute("href")).toBe("/ramenshop");
    expect(scene.getByRole("button", { name: "Garden: Open farm" })).toBeTruthy();
  });

  it("preserves awake/asleep feedback and prevents duplicate pending sleep actions", () => {
    const view = render(<HomeScene {...props} isAsleep />);
    expect(view.getByRole("button", { name: "Wake up" })).toBeTruthy();
    expect(view.getByRole("status").textContent).toContain("You are asleep");
    view.rerender(<HomeScene {...props} isTogglingSleep />);
    fireEvent.click(view.getByRole("button", { name: "Bed: Please wait…" }));
    fireEvent.click(view.getByRole("button", { name: "Please wait…" }));
    expect(props.onSleep).not.toHaveBeenCalled();
    expect(view.getByRole("status").textContent).toContain("Changing sleep status");
  });

  it("keeps storage and management unavailable in a guest residence", () => {
    const view = render(<HomeScene {...props} isGuest />);
    fireEvent.click(view.getByRole("button", { name: "Armory: Home storage is in your own village" }));
    fireEvent.click(view.getByRole("button", { name: "Home storage" }));
    expect(props.onStorage).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Manage home" })).toBeNull();
    expect(view.getByRole("button", { name: "Go to sleep" })).toBeTruthy();
  });

  it("keeps textual navigation working when the artwork fails", () => {
    const view = render(<HomeScene {...props} />);
    fireEvent.error(view.getByAltText(`${HomeTypeDetails.NONE.name} interior`));
    const actions = within(view.getByRole("group", { name: "Home actions" }));
    fireEvent.click(actions.getByRole("button", { name: "Home storage" }));
    expect(props.onStorage).toHaveBeenCalledTimes(1);
    fireEvent.click(actions.getByRole("button", { name: "Farm" }));
    expect(props.onFarm).toHaveBeenCalledTimes(1);
    expect(view.getByText(/Home artwork is unavailable/)).toBeTruthy();
  });

  it("loads a new tier after artwork failure while keeping dialog triggers mounted", () => {
    const view = render(<HomeScene {...props} />);
    const trigger = view.getByRole("button", { name: "Manage home" });
    fireEvent.error(view.getByAltText(`${HomeTypeDetails.NONE.name} interior`));
    view.rerender(<HomeScene {...props} homeType="PALACE" />);
    expect(view.getByAltText("Palace interior").getAttribute("src")).toBe(HOME_SCENE_IMAGES.PALACE);
    expect(view.queryByText(/Home artwork is unavailable/)).toBeNull();
    expect(view.getByRole("button", { name: "Manage home" })).toBe(trigger);
  });

  it("edits furniture without triggering its game action and cancels without saving", () => {
    const view = render(<HomeScene {...props} canDecorate />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    const bed = view.getByRole("button", { name: "Move Bed" });
    const before = bed.style.left;
    fireEvent.keyDown(bed, { key: "ArrowRight" });
    expect(bed.style.left).not.toBe(before);
    fireEvent.click(bed);
    expect(props.onSleep).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(view.getByRole("button", { name: "Bed: Go to sleep" }).style.left).toBe(before);
  });

  it.each([
    { id: "bed", name: "Bed", width: 800, height: 600, dx: 48, dy: 24, groundY: 55 },
    { id: "bed", name: "Bed", width: 400, height: 300, dx: 24, dy: 12, groundY: 55 },
    { id: "garden", name: "Garden", width: 800, height: 600, dx: 48, dy: 24, groundY: 69 },
    { id: "garden", name: "Garden", width: 400, height: 300, dx: 24, dy: 12, groundY: 69 },
  ] as const)(
    "keeps $id under the pointer in a $width by $height scene and saves normalized coordinates",
    async ({ id, name, width, height, dx, dy, groundY }) => {
      const onSave = vi.fn<NonNullable<ComponentProps<typeof HomeScene>["onSave"]>>().mockResolvedValue(false);
      const layout = getDefaultHomeLayout().map((placement) => ({ ...placement, x: 50, y: 50 }));
      const view = render(<HomeScene {...props} canDecorate layout={layout} onSave={onSave} />);
      fireEvent.click(view.getByRole("button", { name: "Decorate" }));
      const furniture = view.getByRole("button", { name: `Move ${name}` });
      furniture.setPointerCapture = vi.fn();
      view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
        new DOMRect(0, 0, width, height);
      const before = [Number.parseFloat(furniture.style.left), Number.parseFloat(furniture.style.top)];
      expect(before).toEqual([50, groundY]);

      firePointerEvent(furniture, "pointerdown", 1, 110, 140);
      firePointerEvent(furniture, "pointermove", 1, 110 + dx, 140 + dy);
      expect((Number.parseFloat(furniture.style.left) - before[0]!) * width / 100).toBeCloseTo(dx, 1);
      expect((Number.parseFloat(furniture.style.top) - before[1]!) * height / 100).toBeCloseTo(dy, 1);
      firePointerEvent(furniture, "pointerup", 1, 110 + dx, 140 + dy);
      fireEvent.click(view.getByRole("button", { name: "Save layout" }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave.mock.calls[0]![0].placements.find((placement) => placement.id === id)).toEqual({
        id, x: 59.38, y: 58, rotation: 0,
      });
      expect(layout.find((placement) => placement.id === id)).toEqual({ id, x: 50, y: 50, rotation: 0 });
    },
  );

  it.each([
    { key: "ArrowLeft", x: 48, y: 50 },
    { key: "ArrowUp", x: 50, y: 48 },
    { key: "ArrowDown", x: 50, y: 52 },
    { key: "ArrowRight", x: 52, y: 50 },
  ])("moves $key along the floor axis without changing the other coordinate", async ({ key, x, y }) => {
    const onSave = vi.fn<NonNullable<ComponentProps<typeof HomeScene>["onSave"]>>().mockResolvedValue(false);
    const layout = getDefaultHomeLayout().map((placement) => ({ ...placement, x: 50, y: 50 }));
    const view = render(<HomeScene {...props} canDecorate layout={layout} onSave={onSave} />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    fireEvent.keyDown(view.getByRole("button", { name: "Move Bed" }), { key });
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].placements.find((placement) => placement.id === "bed")).toEqual({
      id: "bed", x, y, rotation: 0,
    });
  });

  it.each(["Cancel", "Reload saved layout", "Reset arrangement"])(
    "ends the captured drag when %s replaces the draft and permits a new drag",
    (action) => {
      const view = render(<HomeScene {...props} canDecorate />);
      fireEvent.click(view.getByRole("button", { name: "Decorate" }));
      const bed = view.getByRole("button", { name: "Move Bed" });
      bed.setPointerCapture = vi.fn();
      view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
        new DOMRect(0, 0, 1000, 1000);
      const saved = furniturePosition(bed);
      fireEvent.keyDown(bed, { key: "ArrowRight" });
      const dragOrigin = furniturePosition(bed);
      expect(dragOrigin).not.toEqual(saved);
      firePointerEvent(bed, "pointerdown", 1);
      firePointerEvent(bed, "pointermove", 1, 120, 120);
      expect(furniturePosition(bed)).not.toEqual(dragOrigin);

      fireEvent.click(view.getByRole("button", { name: action }));
      if (action === "Cancel") {
        fireEvent.click(view.getByRole("button", { name: "Decorate" }));
      }
      const replacement = view.getByRole("button", { name: "Move Bed" });
      expect(furniturePosition(replacement)).toEqual(saved);
      for (const type of ["pointermove", "pointercancel", "lostpointercapture"]) {
        firePointerEvent(replacement, type, 1, 140, 140);
        expect(furniturePosition(replacement)).toEqual(saved);
      }
      firePointerEvent(replacement, "pointerdown", 2);
      firePointerEvent(replacement, "pointermove", 2, 160, 160);
      expect(furniturePosition(replacement)).not.toEqual(saved);
    },
  );

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "ignores %s from another pointer or furniture while dragging",
    (type) => {
      const view = render(<HomeScene {...props} canDecorate />);
      fireEvent.click(view.getByRole("button", { name: "Decorate" }));
      const bed = view.getByRole("button", { name: "Move Bed" });
      const garden = view.getByRole("button", { name: "Move Garden" });
      bed.setPointerCapture = vi.fn();
      view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
        new DOMRect(0, 0, 1000, 1000);
      const gardenBefore = furniturePosition(garden);
      firePointerEvent(bed, "pointerdown", 1);
      firePointerEvent(bed, "pointermove", 1, 120, 120);
      firePointerEvent(garden, "pointerdown", 2);

      let coordinate = 140;
      for (const [target, pointerId] of [[bed, 2], [garden, 1], [garden, 2]] as const) {
        const moved = furniturePosition(bed);
        firePointerEvent(target, type, pointerId);
        expect(furniturePosition(garden)).toEqual(gardenBefore);
        expect(furniturePosition(bed)).toEqual(moved);
        firePointerEvent(bed, "pointermove", 1, coordinate, coordinate);
        expect(furniturePosition(bed)).not.toEqual(moved);
        coordinate += 20;
      }
    },
  );

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "ends the matching drag on %s and restores the origin only on cancellation",
    (type) => {
      const view = render(<HomeScene {...props} canDecorate />);
      fireEvent.click(view.getByRole("button", { name: "Decorate" }));
      const bed = view.getByRole("button", { name: "Move Bed" });
      const garden = view.getByRole("button", { name: "Move Garden" });
      bed.setPointerCapture = vi.fn();
      view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
        new DOMRect(0, 0, 1000, 1000);
      const bedBefore = furniturePosition(bed);
      const gardenBefore = furniturePosition(garden);
      firePointerEvent(bed, "pointerdown", 1);
      firePointerEvent(bed, "pointermove", 1, 120, 120);
      const moved = furniturePosition(bed);
      expect(moved).not.toEqual(bedBefore);
      firePointerEvent(bed, type, 1);
      const expected = type === "pointercancel" ? bedBefore : moved;
      expect(furniturePosition(bed)).toEqual(expected);
      expect(furniturePosition(garden)).toEqual(gardenBefore);
      firePointerEvent(bed, "pointermove", 1, 160, 160);
      expect(furniturePosition(bed)).toEqual(expected);
    },
  );

  it("retains rejected drafts and saves only the revision that the player began editing", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const view = render(<HomeScene {...props} canDecorate revision={3} onSave={onSave} />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    fireEvent.keyDown(view.getByRole("button", { name: "Move Bed" }), { key: "ArrowRight" });
    view.rerender(<HomeScene {...props} canDecorate revision={4} onSave={onSave} />);
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].revision).toBe(3);
    expect(view.getByRole("button", { name: "Move Bed" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Reload saved layout" }));
    onSave.mockResolvedValue(true);
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Decorate" })).toBeTruthy());
    expect(onSave.mock.calls[1]![0].revision).toBe(4);
  });

  it("ends a captured drag when saving and preserves its submitted position after rejection", async () => {
    let resolveSave!: (success: boolean) => void;
    const pendingSave = new Promise<boolean>((resolve) => { resolveSave = resolve; });
    const onSave = vi.fn<NonNullable<ComponentProps<typeof HomeScene>["onSave"]>>(() => pendingSave);
    const PendingSaveScene = () => {
      const [isSaving, setIsSaving] = useState(false);
      return (
        <HomeScene
          {...props}
          canDecorate
          isSaving={isSaving}
          onSave={async (draft) => {
            setIsSaving(true);
            const success = await onSave(draft);
            setIsSaving(false);
            return success;
          }}
        />
      );
    };
    const view = render(<PendingSaveScene />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    const bed = view.getByRole("button", { name: "Move Bed" });
    bed.setPointerCapture = vi.fn();
    view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
      new DOMRect(0, 0, 1000, 1000);
    const origin = furniturePosition(bed);
    firePointerEvent(bed, "pointerdown", 1);
    firePointerEvent(bed, "pointermove", 1, 120, 120);
    const submitted = furniturePosition(bed);
    expect(submitted).not.toEqual(origin);
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((bed as HTMLButtonElement).disabled).toBe(true);

    for (const type of ["pointermove", "pointercancel", "lostpointercapture"]) {
      firePointerEvent(bed, type, 1, 140, 140);
      expect(furniturePosition(bed)).toEqual(submitted);
    }
    await act(async () => { resolveSave(false); await pendingSave; });
    expect(view.getByRole("button", { name: "Move Bed" })).toBe(bed);
    firePointerEvent(bed, "pointermove", 1, 160, 160);
    expect(furniturePosition(bed)).toEqual(submitted);
    firePointerEvent(bed, "pointerdown", 2);
    firePointerEvent(bed, "pointermove", 2, 180, 180);
    expect(furniturePosition(bed)).not.toEqual(submitted);
  });

  it("keeps essential actions placed and lets owned decorations be placed and stored", () => {
    const view = render(<HomeScene {...props} canDecorate owned={["rug"]} />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    expect(view.queryByRole("button", { name: "Store" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: /Woven Rug.*In storage/ }));
    expect(view.getByRole("button", { name: "Move Woven Rug" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Store" }));
    expect(view.queryByRole("button", { name: "Move Woven Rug" })).toBeNull();
  });

  it("ends a captured decoration drag when storing it and permits another furniture drag", () => {
    const view = render(<HomeScene {...props} canDecorate owned={["rug"]} />);
    fireEvent.click(view.getByRole("button", { name: "Decorate" }));
    fireEvent.click(view.getByRole("button", { name: /Woven Rug.*In storage/ }));
    const rug = view.getByRole("button", { name: "Move Woven Rug" });
    rug.setPointerCapture = vi.fn();
    view.getByRole("group", { name: "Home scene" }).getBoundingClientRect = () =>
      new DOMRect(0, 0, 1000, 1000);
    firePointerEvent(rug, "pointerdown", 1);
    firePointerEvent(rug, "pointermove", 1, 140, 140);
    fireEvent.click(view.getByRole("button", { name: "Store" }));
    expect(view.queryByRole("button", { name: "Move Woven Rug" })).toBeNull();
    // Removing the capture target sends its capture loss and pointer release to the document.
    firePointerEvent(document, "lostpointercapture", 1);
    firePointerEvent(document, "pointerup", 1);

    const bed = view.getByRole("button", { name: "Move Bed" });
    bed.setPointerCapture = vi.fn();
    const origin = furniturePosition(bed);
    firePointerEvent(bed, "pointerdown", 2);
    firePointerEvent(bed, "pointermove", 2, 120, 120);
    expect(furniturePosition(bed)).not.toEqual(origin);
    expect(bed.setPointerCapture).toHaveBeenCalledWith(2);
    expect(view.getByRole("button", { name: /Woven Rug.*In storage/ })).toBeTruthy();
  });
});

const furniturePosition = (target: HTMLElement) => [target.style.left, target.style.top];

const firePointerEvent = (
  target: HTMLElement | Document,
  type: string,
  pointerId: number,
  clientX = 100,
  clientY = 100,
) => {
  // jsdom has no PointerEvent constructor; dispatch its mouse coordinates with a pointer ID.
  const event = new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(target, event);
};
