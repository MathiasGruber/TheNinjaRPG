import { vi } from "bun:test";

/** Bun shares module mocks across suites, so every toast export must remain available. */
export const createToastMock = () => ({
  triggerConfetti: vi.fn(),
  showMutationToast: vi.fn(),
  showFormErrorsToast: vi.fn(),
  showRewardToast: vi.fn(),
}) satisfies typeof import("@/libs/toast");
