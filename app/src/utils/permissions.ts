import { UserRoles } from "@/drizzle/constants";
import type { UserRole } from "@/drizzle/constants";

export const canChangeContent = (role: UserRole) => {
  return ["CONTENT", "EVENT", "ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canPlayHiddenQuests = (role: UserRole) => {
  return ["CONTENT", "EVENT", "CONTENT-ADMIN"].includes(role);
};

export const canSubmitNotification = (role: UserRole) => {
  return ["CONTENT", "EVENT", "ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canModifyEventGains = (role: UserRole) => {
  return ["ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canChangeUserRole = (role: UserRole) => {
  if (role === "ADMIN") {
    return UserRoles;
  } else if (role === "CONTENT-ADMIN") {
    return ["USER", "CONTENT", "EVENT", "CONTENT-ADMIN"];
  }
};

export const canSwapVillage = (role: UserRole) => {
  return role !== "USER";
};

export const canUnstuckVillage = (role: UserRole) => {
  return role !== "USER";
};

export const canSwapBloodline = (role: UserRole) => {
  return ["CONTENT-ADMIN", "CONTENT", "EVENT", "ADMIN"].includes(role);
};

export const canSeeSecretData = (role: UserRole) => {
  return ["MODERATOR", "ADMIN"].includes(role);
};

export const canModifyUserBadges = (role: UserRole) => {
  return ["ADMIN", "CONTENT-ADMIN", "EVENT", "CONTENT"].includes(role);
};
