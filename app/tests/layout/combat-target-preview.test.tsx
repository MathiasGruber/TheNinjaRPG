import "../setup-dom.mjs";
import { afterEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CombatTargetPreview } from "@/layout/CombatTargetPreview";

afterEach(cleanup);
it("updates coordinate origins, exclusions and random candidates on the preview grid", () => {
  const pattern = { origin: "BATTLEFIELD" as const, selection: "ALL" as const, coordinates: [{ longitude: 0, latitude: 0 }], randomCount: 2 };
  const view = render(<CombatTargetPreview action={{ method: "COORDINATES", range: 0, coordinateTargeting: pattern }} />);
  expect(view.getByRole("button", { name: "A1 (0, 0) affected" })).toBeTruthy();
  view.rerender(<CombatTargetPreview action={{ method: "COORDINATES", range: 0, coordinateTargeting: { ...pattern, origin: "TARGET" } }} />);
  expect(view.getByRole("button", { name: "H5 (7, 4) affected T" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "B2 (1, 1)" }));
  expect(view.getByRole("button", { name: "B2 (1, 1) affected T" })).toBeTruthy();
  view.rerender(<CombatTargetPreview action={{ method: "COORDINATES", range: 0, coordinateTargeting: { ...pattern, selection: "EXCLUDE" } }} />);
  expect(view.getByText(/119 affected tiles/)).toBeTruthy();
  view.rerender(<CombatTargetPreview action={{ method: "COORDINATES", range: 0, coordinateTargeting: { ...pattern, selection: "RANDOM", coordinates: [] } }} />);
  expect(view.getByText(/120 candidate tiles; up to 2 chosen per cast/)).toBeTruthy();
});
it("clips to resized maps and moves caster using the keyboard", () => {
  const view = render(<CombatTargetPreview action={{ method: "SINGLE", range: 2, methodSize: { x: 1, y: 0 } }} />);
  expect(view.getByText(/3 affected tiles/)).toBeTruthy();
  fireEvent.input(view.getByLabelText("Preview columns"), { target: { value: "1" } });
  expect(view.getByText(/1 affected tiles/)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Place caster (C)" }));
  fireEvent.keyDown(view.getByRole("button", { name: "A1 (0, 0)" }), { key: "Enter" });
  expect(view.getByText(/Caster: \(0, 0\)/)).toBeTruthy();
});
