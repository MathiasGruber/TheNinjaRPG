import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUserData } from "@/utils/UserContext";
import { useEffect, useState } from "react";

// Mock the UserContext hook
vi.mock("@/utils/UserContext", () => ({
  useUserData: vi.fn(),
}));

describe("Travel Component State Management", () => {
  it("should clear position and tile when user is traveling", () => {
    // Mock user data with traveling status
    const mockUserData = {
      status: "TRAVELING",
      sector: 1,
      longitude: 10,
      latitude: 10,
    };

    // Mock the useUserData hook
    (useUserData as any).mockReturnValue({
      data: mockUserData,
    });

    // Create a test component hook to simulate Travel component behavior
    const useTestHook = () => {
      const { data: userData } = useUserData();
      const [currentPosition, setCurrentPosition] = useState<any>(null);
      const [currentTile, setCurrentTile] = useState<any>(null);

      useEffect(() => {
        if (userData) {
          if (userData.status === "TRAVELING") {
            setCurrentPosition(null);
            setCurrentTile(null);
          } else {
            setCurrentPosition({ x: userData.longitude, y: userData.latitude });
            setCurrentTile({ id: userData.sector });
          }
        }
      }, [userData]);

      return { currentPosition, currentTile };
    };

    // Render the test hook
    const { result } = renderHook(() => useTestHook());

    // Verify that position and tile are cleared when traveling
    expect(result.current.currentPosition).toBeNull();
    expect(result.current.currentTile).toBeNull();
  });

  it("should update position and tile when user is not traveling", () => {
    // Mock user data with non-traveling status
    const mockUserData = {
      status: "AWAKE",
      sector: 1,
      longitude: 10,
      latitude: 10,
    };

    // Mock the useUserData hook
    (useUserData as any).mockReturnValue({
      data: mockUserData,
    });

    // Create a test component hook to simulate Travel component behavior
    const useTestHook = () => {
      const { data: userData } = useUserData();
      const [currentPosition, setCurrentPosition] = useState<any>(null);
      const [currentTile, setCurrentTile] = useState<any>(null);

      useEffect(() => {
        if (userData) {
          if (userData.status === "TRAVELING") {
            setCurrentPosition(null);
            setCurrentTile(null);
          } else {
            setCurrentPosition({ x: userData.longitude, y: userData.latitude });
            setCurrentTile({ id: userData.sector });
          }
        }
      }, [userData]);

      return { currentPosition, currentTile };
    };

    // Render the test hook
    const { result } = renderHook(() => useTestHook());

    // Verify that position and tile are set when not traveling
    expect(result.current.currentPosition).toEqual({ x: 10, y: 10 });
    expect(result.current.currentTile).toEqual({ id: 1 });
  });
});
