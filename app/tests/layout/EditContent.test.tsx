import { ensureDom } from "../setup-dom.mjs";
import { createToastMock } from "../setup/toastMock";
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { useState } from "react";
import {
  DamageTag,
  HealTag,
  JutsuValidatorRawSchema,
  type ZodAllTags,
} from "@/validators/combat";

const save = vi.fn(async (_input: { id: string; data: { effects: ZodAllTags[] } }) => ({
  success: true,
  message: "Saved",
}));
const pending = vi.fn();
const toast = vi.fn();
const names = { useQuery: () => ({ data: [] }) };
const update = { useMutation: () => ({ mutateAsync: save }) };

vi.mock("@/app/_trpc/client", () => ({
  api: {
    profile: { getAllAiNames: names },
    item: { getAllNames: names, update },
    jutsu: { getAllNames: names, update },
    bloodline: { getAllNames: names, update },
    sageMode: { getAllNames: names },
    skillTree: { getAllNames: names },
    badge: { getAll: names },
    misc: { getAllGameAssetNames: names },
    gameAsset: {
      getNameTags: names,
      getSceneAssets: names,
      getAll: { useInfiniteQuery: () => ({ data: { pages: [] } }) },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/libs/toast", () => ({ ...createToastMock(), showMutationToast: toast }));
vi.mock("@/layout/ContentImageSelector", () => ({ default: () => null }));

vi.mock("@radix-ui/react-use-size", () => ({
  useSize: () => ({ width: 0, height: 0 }),
}));

const { MassEffectEditor, EffectFormWrapper } = await import("@/layout/EditContent");

beforeEach(() => {
  ensureDom();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("MassEffectEditor numeric drafts", () => {
  for (const kind of ["item", "jutsu", "bloodline"] as const) {
    it(`validates all ${kind} effect rows for the saved entry and retains invalid drafts`, async () => {
      const entries = [
        {
          id: "first",
          name: "First",
          effects: [DamageTag.parse({}), DamageTag.parse({})],
          updatedAt: new Date(),
        },
        {
          id: "second",
          name: "Second",
          effects: [DamageTag.parse({})],
          updatedAt: new Date(),
        },
      ];
      const view = render(
        <MassEffectEditor
          kind={kind}
          entries={entries}
          selectedFields={["power"]}
          onPendingChange={pending}
        />,
      );
      const inputs = view.getAllByRole("spinbutton") as HTMLInputElement[];
      const invalid = inputs[1]!;
      const reportValidity = vi.spyOn(invalid, "reportValidity");
      fireEvent.input(invalid, { target: { value: "" } });
      fireEvent.click(
        view.getAllByRole("button", { name: `Save ${kind} effects for First` })[0]!,
      );

      expect(reportValidity).toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(pending).not.toHaveBeenCalled();
      expect(invalid.value).toBe("");
      expect(invalid.getAttribute("aria-invalid")).toBe("true");
      expect(view.container.firstElementChild?.getAttribute("aria-busy")).toBe("false");

      fireEvent.click(
        view.getByRole("button", { name: `Save ${kind} effects for Second` }),
      );
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
      expect(save.mock.calls[0]?.[0]).toMatchObject({ id: "second" });
      expect(invalid.value).toBe("");

      fireEvent.input(inputs[0]!, { target: { value: "3.5" } });
      fireEvent.input(invalid, { target: { value: "7" } });
      fireEvent.click(
        view.getAllByRole("button", { name: `Save ${kind} effects for First` })[0]!,
      );
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[0]).toMatchObject({
        id: "first",
        data: { effects: [{ power: 3.5 }, { power: 7 }] },
      });
      await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
    });

    it(`blocks ${kind} drafts after their numeric field or effect row is hidden`, async () => {
      const entries = [
        {
          id: "first",
          name: "First",
          effects: [DamageTag.parse({}), DamageTag.parse({}), HealTag.parse({})],
          updatedAt: new Date(),
        },
      ];
      const mount = (selectedFields: string[], filterEffectTypes?: string[]) => (
        <MassEffectEditor
          kind={kind}
          entries={entries}
          selectedFields={selectedFields}
          filterEffectTypes={filterEffectTypes}
          onPendingChange={pending}
        />
      );
      const view = render(mount(["power"]));
      fireEvent.input(view.getAllByRole("spinbutton")[1]!, { target: { value: "" } });
      view.rerender(mount(["description"]));
      fireEvent.click(
        view.getAllByRole("button", { name: `Save ${kind} effects for First` })[0]!,
      );
      expect(save).not.toHaveBeenCalled();
      expect(pending).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
      view.rerender(mount(["power"], ["heal"]));
      fireEvent.click(
        view.getByRole("button", { name: `Save ${kind} effects for First` }),
      );
      expect(save).not.toHaveBeenCalled();
      expect(pending).not.toHaveBeenCalled();
      view.rerender(mount(["power"]));
      expect((view.getAllByRole("spinbutton")[1] as HTMLInputElement).value).toBe("");
      fireEvent.input(view.getAllByRole("spinbutton")[1]!, { target: { value: "7" } });
      fireEvent.click(
        view.getAllByRole("button", { name: `Save ${kind} effects for First` })[0]!,
      );
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
    });
  }
});

const CoordinateDraftForm = () => {
  const [effects, setEffects] = useState<ZodAllTags[]>([
    DamageTag.parse({
      target: "COORDINATES",
      coordinateTargeting: {
        origin: "BATTLEFIELD",
        selection: "ALL",
        randomCount: 1,
        coordinates: [
          { longitude: 1, latitude: 1 },
          { longitude: 2, latitude: 1 },
        ],
      },
    }),
  ]);
  return (
    <>
      <EffectFormWrapper
        type="jutsu"
        allowCoordinateTargeting
        idx={0}
        tag={effects[0]!}
        effects={effects}
        setEffects={setEffects}
        availableTags={["damage"]}
      />
      <button
        type="button"
        onClick={() => {
          if (JutsuValidatorRawSchema.shape.effects.safeParse(effects).success) {
            void save({ id: "coordinates", data: { effects } });
          }
        }}
      >
        Save coordinate effects
      </button>
    </>
  );
};

describe("coordinate effect drafts", () => {
  const globals = [
    "Event",
    "CustomEvent",
    "ResizeObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ] as const;
  const descriptors = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const scrollDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  beforeEach(() => {
    Object.defineProperties(globalThis, {
      Event: { configurable: true, value: window.Event },
      CustomEvent: { configurable: true, value: window.CustomEvent },
      requestAnimationFrame: {
        configurable: true,
        value: (callback: FrameRequestCallback) =>
          Number(setTimeout(() => callback(Date.now()), 0)),
      },
      cancelAnimationFrame: {
        configurable: true,
        value: (id: number) => clearTimeout(id),
      },
      ResizeObserver: {
        configurable: true,
        value: class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      },
    });
    HTMLElement.prototype.scrollIntoView = () => {};
  });
  afterEach(() => {
    cleanup();
    globals.forEach((key, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
    if (scrollDescriptor)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  for (const target of ["INHERIT", "SELF"] as const) {
    it(`discards invalid coordinates when changing target to ${target}`, async () => {
      const view = render(<CoordinateDraftForm />);
      fireEvent.input(view.getByRole("spinbutton", { name: "Coordinate 2 column" }), {
        target: { value: "1" },
      });
      await waitFor(() =>
        expect(view.getByText("Coordinates must be unique.")).toBeDefined(),
      );
      fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
      expect(save).not.toHaveBeenCalled();
      fireEvent.click(view.getByRole("combobox", { name: "target" }));
      fireEvent.click(await view.findByRole("option", { name: target }));
      await waitFor(() =>
        expect(
          view.queryByRole("spinbutton", { name: "Coordinate 2 column" }),
        ).toBeNull(),
      );
      fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]?.[0].data.effects[0]).toMatchObject({
        target,
        coordinateTargeting: null,
      });
    });
  }

  it("blocks duplicate coordinates in parent validation and saves corrected drafts", async () => {
    const view = render(<CoordinateDraftForm />);
    fireEvent.input(view.getByRole("spinbutton", { name: "Coordinate 2 column" }), {
      target: { value: "1" },
    });
    await waitFor(() =>
      expect(view.getByText("Coordinates must be unique.")).toBeDefined(),
    );
    fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.input(view.getByRole("spinbutton", { name: "Coordinate 2 column" }), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(view.queryByText("Coordinates must be unique.")).toBeNull(),
    );
    fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      save.mock.calls[0]?.[0].data.effects[0]?.coordinateTargeting?.coordinates[1]
        ?.longitude,
    ).toBe(3);
  });
  it("keeps blank coordinate drafts invalid until corrected", async () => {
    const view = render(<CoordinateDraftForm />);
    const column = view.getByRole("spinbutton", { name: "Coordinate 1 column" });
    fireEvent.input(column, { target: { value: "" } });
    await waitFor(() => expect(view.getByRole("alert")).toBeDefined());
    fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
    expect(save).not.toHaveBeenCalled();
    expect((column as HTMLInputElement).value).toBe("");
    fireEvent.input(column, { target: { value: "4" } });
    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
    fireEvent.click(view.getByRole("button", { name: "Save coordinate effects" }));
    expect(save).toHaveBeenCalledTimes(1);
  });
});
