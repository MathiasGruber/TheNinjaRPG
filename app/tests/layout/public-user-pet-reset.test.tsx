import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as clerk from "@clerk/nextjs";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs } from "@/app/_trpc/client";
import TrpcClientProvider from "@/app/_trpc/Provider";
import { ResetPetImageGeneration } from "@/layout/PublicUser";
import * as toast from "@/libs/toast";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
let queryClient: QueryClient;
let reset: ReturnType<typeof vi.fn>;
let scrollDescriptor: PropertyDescriptor | undefined;
const browserGlobals = ["Event", "CustomEvent", "ResizeObserver"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));

beforeEach(() => {
  ensureDom();
  scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  Object.defineProperties(globalThis, {
    Event: { configurable: true, value: window.Event },
    CustomEvent: { configurable: true, value: window.CustomEvent },
    ResizeObserver: { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } },
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  reset = vi.fn((_input: RouterInputs["profile"]["resetPetImageGeneration"]) => ({ success: false, message: "Generation is still running." }));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  browserGlobals.forEach((key, index) => {
    const descriptor = browserDescriptors[index];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
});

const mount = () => {
  Object.assign(vi.spyOn(client, "api" as never), {
    profile: testApi.profile,
    pets: testApi.pets,
    useUtils: testApi.useUtils,
  });
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    let data: unknown;
    if (op.path === "profile.getPetImageGenerationForStaff") {
      data = [
        { id: "first-pet", name: "Miso", generationAttempts: 2, generationStatus: "FAILED" },
        { id: "second-pet", name: "Tama", generationAttempts: 1, generationStatus: "FAILED" },
      ];
    } else if (op.path === "profile.resetPetImageGeneration") {
      data = reset(op.input);
    } else throw new Error(`Unexpected procedure ${op.path}`);
    observer.next({ result: { data } });
    observer.complete();
  })] });
  return render(
    <testApi.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ResetPetImageGeneration userId="player" username="Player" />
      </QueryClientProvider>
    </testApi.Provider>,
  );
};

it("selects another companion with Enter and resets only that companion after confirmation", async () => {
  const view = mount();
  fireEvent.click(view.getByRole("button", { name: "Reset companion image attempts for Player" }));
  const dialog = await view.findByRole("dialog", { name: "Reset companion image attempts" });
  const trigger = await within(dialog).findByRole("combobox", { name: "Companion" });
  fireEvent.click(trigger);
  fireEvent.click(await view.findByRole("option", { name: "Miso · 2/3 attempts used" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason *" }), { target: { value: " Image creation failed repeatedly " } });
  expect(within(dialog).getByRole("button", { name: "Reset attempts" }).hasAttribute("disabled")).toBe(false);

  act(() => trigger.focus());
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const first = await view.findByRole("option", { name: "Miso · 2/3 attempts used" });
  await waitFor(() => expect(document.activeElement === first).toBe(true));
  fireEvent.keyDown(first, { key: "ArrowDown" });
  const chosen = view.getByRole("option", { name: "Tama · 1/3 attempts used" });
  await waitFor(() => expect(document.activeElement === chosen).toBe(true));
  await act(async () => { fireEvent.keyDown(chosen, { key: "Enter" }); });
  expect(reset).not.toHaveBeenCalled();
  expect(view.getByRole("dialog", { name: "Reset companion image attempts" }) === dialog).toBe(true);
  expect(trigger.textContent).toContain("Tama");

  fireEvent.click(within(dialog).getByRole("button", { name: "Reset attempts" }));
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  expect(reset).toHaveBeenCalledWith({ userId: "player", petId: "second-pet", reason: "Image creation failed repeatedly" });
  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Generation is still running.");
});

it.each(["Escape", "Close"])("returns focus to the staff action after %s", async (dismiss) => {
  const view = mount();
  const opener = view.getByRole("button", { name: "Reset companion image attempts for Player" });
  act(() => opener.focus());
  fireEvent.click(opener);
  const dialog = await view.findByRole("dialog", { name: "Reset companion image attempts" });
  const reason = within(dialog).getByRole("textbox", { name: "Reason *" });
  act(() => reason.focus());
  if (dismiss === "Escape") fireEvent.keyDown(reason, { key: "Escape" });
  else fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0]!);
  await waitFor(() => expect(view.queryByRole("dialog", { name: "Reset companion image attempts" })).toBeNull());
  await waitFor(() => expect(document.activeElement === opener).toBe(true));
  expect(reset).not.toHaveBeenCalled();
});

it("shows a failed request in the staff dialog and preserves the inputs for retry", async () => {
  vi.spyOn(clerk, "useClerk").mockReturnValue({
    isSignedIn: true,
    session: { id: "staff-session", getToken: async () => "staff-token" },
  } as unknown as ReturnType<typeof clerk.useClerk>);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
  let isOffline = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    let data: unknown;
    if (String(url).includes("profile.getPetImageGenerationForStaff")) {
      data = [{ id: "first-pet", name: "Miso", generationAttempts: 2, generationStatus: "FAILED" }];
    } else if (String(url).includes("profile.resetPetImageGeneration")) {
      if (isOffline) throw new TypeError("Failed to fetch");
      data = reset(JSON.parse(String(init?.body))["0"].json);
    } else throw new Error(`Unexpected request ${String(url)}`);
    return new Response(JSON.stringify([{ result: { data: superjson.serialize(data) } }]), {
      headers: { "content-type": "application/json" },
    });
  });
  const view = render(
    <TrpcClientProvider cdnCachedQueryPaths={[]}>
      <ResetPetImageGeneration userId="player" username="Player" />
    </TrpcClientProvider>,
  );
  fireEvent.click(view.getByRole("button", { name: "Reset companion image attempts for Player" }));
  const dialog = await view.findByRole("dialog", { name: "Reset companion image attempts" });
  const trigger = await within(dialog).findByRole("combobox", { name: "Companion" });
  fireEvent.click(trigger);
  fireEvent.click(await view.findByRole("option", { name: "Miso · 2/3 attempts used" }));
  const reason = within(dialog).getByRole("textbox", { name: "Reason *" });
  fireEvent.change(reason, { target: { value: "Image creation failed repeatedly" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reset attempts" }));

  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Failed to fetch");
  expect(trigger.textContent).toContain("Miso");
  expect(reason).toHaveProperty("value", "Image creation failed repeatedly");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Reset attempts" }).hasAttribute("disabled")).toBe(false));
  expect(view.getByRole("dialog", { name: "Reset companion image attempts" }) === dialog).toBe(true);

  isOffline = false;
  reset.mockReturnValue({ success: true, message: "Companion image attempts reset." });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reset attempts" }));
  await waitFor(() => expect(view.queryByRole("dialog", { name: "Reset companion image attempts" })).toBeNull());
  expect(reset).toHaveBeenCalledWith({ userId: "player", petId: "first-pet", reason: "Image creation failed repeatedly" });
});
