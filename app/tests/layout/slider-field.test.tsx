import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { useForm, useWatch } from "react-hook-form";
import SliderField from "@/layout/SliderField";
import { ensureDom } from "../setup-dom.mjs";

beforeEach(() => {
  ensureDom();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function SliderForm({
  initial = 10,
  min = 0,
  max = 31,
  step = 1,
  disabled = false,
  onSave = () => {},
}: {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onSave?: (value: number) => void;
}) {
  const form = useForm({ defaultValues: { amount: initial } });
  const amount = useWatch({ control: form.control, name: "amount" });
  return (
    <>
      <SliderField
        id="amount"
        label="Amount"
        default={initial}
        min={min}
        max={max}
        step={step}
        watchedValue={amount}
        register={form.register}
        setValue={form.setValue}
        disabled={disabled}
      />
      <button type="button" onClick={() => onSave(form.getValues("amount"))}>
        Save
      </button>
      <output>{amount}</output>
    </>
  );
}

describe("slider form drafts", () => {
  it.each(["input", "change"] as const)(
    "saves the latest native %s immediately",
    (event) => {
      const save = vi.fn();
      const view = render(<SliderForm onSave={save} />);
      const slider = view.getByRole("slider") as HTMLInputElement;
      fireEvent[event](slider, { target: { value: "20" } });
      fireEvent.click(view.getByRole("button", { name: "Save" }));
      expect(slider.value).toBe("20");
      expect(view.getByRole("status").textContent).toBe("20");
      expect(save).toHaveBeenCalledWith(20);
    },
  );

  it.each([
    ["plus", 21],
    ["minus", 19],
  ] as const)("keeps a drag followed by %s in order", (direction, expected) => {
    const save = vi.fn();
    const view = render(<SliderForm onSave={save} />);
    fireEvent.input(view.getByRole("slider"), { target: { value: "20" } });
    fireEvent.click(view.container.querySelector(`.lucide-circle-${direction}`)!);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(view.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(expected);
    expect((view.getByRole("slider") as HTMLInputElement).value).toBe(String(expected));
  });

  it("preserves fractional steps and bounds for both controls", () => {
    const view = render(<SliderForm initial={0.25} min={0} max={0.5} step={0.25} />);
    const slider = view.getByRole("slider") as HTMLInputElement;
    const plus = view.container.querySelector(".lucide-circle-plus")!;
    const minus = view.container.querySelector(".lucide-circle-minus")!;
    expect(slider.step).toBe("0.25");
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(slider.value).toBe("0.5");
    fireEvent.click(minus);
    fireEvent.click(minus);
    fireEvent.click(minus);
    expect(slider.value).toBe("0");
    expect(view.getByRole("status").textContent).toBe("0");
  });

  it("guards range and increment changes while disabled", () => {
    const save = vi.fn();
    const view = render(<SliderForm disabled onSave={save} />);
    expect((view.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
    fireEvent.input(view.getByRole("slider"), { target: { value: "20" } });
    fireEvent.click(view.container.querySelector(".lucide-circle-plus")!);
    fireEvent.click(view.container.querySelector(".lucide-circle-minus")!);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(view.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(10);
  });

  it("does not defer a range write until after unmount", () => {
    const setValue = vi.fn();
    const view = render(
      <SliderField
        id="amount"
        default={10}
        min={0}
        max={31}
        watchedValue={10}
        register={vi.fn()}
        setValue={setValue}
      />,
    );
    fireEvent.input(view.getByRole("slider"), { target: { value: "20" } });
    expect(setValue).toHaveBeenCalledTimes(1);
    view.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(setValue).toHaveBeenCalledTimes(1);
  });
});
