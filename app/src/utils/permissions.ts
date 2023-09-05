import type { UserRoles } from "../../drizzle/constants";

export const canChangeContent = (role: typeof UserRoles[number]) => {
  return ["CONTENT", "ADMIN"].includes(role);
};

export const canSubmitNotification = (role: typeof UserRoles[number]) => {
  return ["CONTENT", "EVENT", "ADMIN"].includes(role);
};
