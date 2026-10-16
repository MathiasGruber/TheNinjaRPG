import { afterEach, describe, expect, it } from "bun:test";
import { finishItemConsumeRequest, getItemConsumeRequestId } from "@/libs/itemConsumption";

afterEach(() => { for (const user of ["first", "second"]) finishItemConsumeRequest(user, "stack"); });

describe("item opening request identity", () => {
  it("retains the same request across uncertain retries and isolates accounts", () => {
    const request = getItemConsumeRequestId("first", "stack");
    expect(getItemConsumeRequestId("first", "stack")).toBe(request);
    expect(getItemConsumeRequestId("second", "stack")).not.toBe(request);
    finishItemConsumeRequest("first", "stack");
    expect(getItemConsumeRequestId("first", "stack")).not.toBe(request);
  });
});
