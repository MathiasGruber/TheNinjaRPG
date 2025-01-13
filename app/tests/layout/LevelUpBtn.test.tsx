import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LevelUpBtn from "@/layout/LevelUpBtn";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";

// Mock the required modules
jest.mock("@/utils/UserContext", () => ({
  useRequiredUserData: () => ({
    data: {
      level: 99,
      experience: 10000000,
      userId: "test-user",
    },
  }),
}));

jest.mock("@/app/_trpc/client", () => ({
  api: {
    useUtils: () => ({
      profile: {
        getUser: {
          invalidate: () => {},
        },
      },
    }),
    profile: {
      levelUp: {
        useMutation: () => ({
          mutate: () => {},
        }),
      },
    },
  },
}));

jest.mock("@next/third-parties/google", () => ({
  sendGTMEvent: () => {},
}));

describe("LevelUpBtn", () => {

  it("should show level up button when user has enough experience and level < 100", () => {
    // Mock user data for level 99 with enough experience
    jest.mocked(useRequiredUserData).mockReturnValue({
      data: {
        level: 99,
        experience: 10000000, // High enough to level up
        userId: "test-user",
      },
    });

    render(<LevelUpBtn />);
    expect(screen.getByText("Level up!")).toBeInTheDocument();
  });

  it("should not show level up button when user is at level 100", () => {
    // Mock user data for level 100
    jest.mocked(useRequiredUserData).mockReturnValue({
      data: {
        level: 100,
        experience: 10000000, // High enough to level up
        userId: "test-user",
      },
    });

    render(<LevelUpBtn />);
    expect(screen.queryByText("Level up!")).not.toBeInTheDocument();
  });

  it("should not show level up button when user doesn't have enough experience", () => {
    // Mock user data for level 50 with not enough experience
    jest.mocked(useRequiredUserData).mockReturnValue({
      data: {
        level: 50,
        experience: 0, // Not enough to level up
        userId: "test-user",
      },
    });

    render(<LevelUpBtn />);
    expect(screen.queryByText("Level up!")).not.toBeInTheDocument();
  });
});
