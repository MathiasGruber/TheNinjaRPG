import { vi } from "bun:test";

export const timerClaimFixture = () => ({
  isClaimed: true,
  prevValue: 0,
  release: vi.fn(async () => true),
  update: vi.fn(async (_value: number, _time: Date) => true),
});
