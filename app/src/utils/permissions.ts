import { UserRoles } from "@/drizzle/constants";
import type { UserRole } from "@/drizzle/constants";

export const canChangeContent = (role: UserRole) => {
  return ["CONTENT", "ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canSubmitNotification = (role: UserRole) => {
  return ["CONTENT", "EVENT", "ADMIN"].includes(role);
};

export const canChangeUserRole = (role: UserRole) => {
  if (role === "ADMIN") {
    return UserRoles;
  } else if (role === "CONTENT-ADMIN") {
    return ["USER", "CONTENT", "EVENT", "CONTENT-ADMIN"];
  }
};
