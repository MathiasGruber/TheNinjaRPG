import React, { useState, useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
export const trace: string[] = [];
export const user = { userId: "fixture-user", username: "Local fixture", role: "USER", status: "AWAKE", level: 2, tutorialOn: true, tutorialStep: 1, userQuests: [], questData: [] };
export const navigate = (path: string) => {
  trace.push(`${location.pathname} → ${path}`);
  history.pushState({}, "", path);
  listeners.forEach((fn) => fn());
};
export const router = { push: navigate, replace: navigate, back: () => navigate("/profile"), refresh() {} };
export const usePublicPathname = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => location.pathname);
export const useUserData = () => ({ data: user, updateUser: async () => {}, userAgent: "Local fixture desktop" });
export const steps = [
  { id: "welcome", title: "Welcome to the game", description: "Welcome to The Ninja-Rpg!", page: "/profile", showNextButton: true },
  { id: "strengths", title: "Strengths & Weaknesses", description: "In this section of the profile you can view the specifics of your character, your stats, strengths and weaknesses. Kinda weak right now, but we'll get you stronger. Let's go the the battle arena to train a bit. ", elementIds: ["tutorial-strength-weaknesses"], page: "/profile", showNextButton: true, proceedOnHighlightClick: true },
];
const updateTutorialStep = () => {};
export const useTutorialStep = () => {
  const [isAssistantVisible, setIsAssistantVisible] = useState(false);
  return { currentStep: steps[1], currentStepNumber: 1, isAssistantVisible, setIsAssistantVisible, updateTutorialStep, handleNextStep() {}, handleNextStepAsync: async () => {} };
};
export const api = {
  useUtils: () => ({}),
  profile: { updatePreferences: { useMutation: () => ({ mutateAsync: async () => ({ success: true }) }) } },
  gameAsset: { getSceneAssets: { useQuery: () => ({ data: [] }) } },
  guide: { create: { useMutation: () => ({ mutate() {}, isPending: false }) }, getAll: { useQuery: () => ({ data: undefined }) } },
};
export const Image = ({ src, ...props }: any) => src.includes("assistant") || props.alt === "Assistant" ? <img {...props} src="/lemu.webp" /> : <div {...props} style={{ ...props.style, background: "linear-gradient(135deg, #efdbc1, #b6c1bc)", display: "grid", placeItems: "center" }} aria-label={`${props.alt} — fixture image placeholder`}>忍</div>;
