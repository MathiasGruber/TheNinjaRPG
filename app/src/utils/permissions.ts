import type { UserRoles } from "../../drizzle/constants";

export const canChangeContent = (role: typeof UserRoles[number]) => {
  return ["CONTENT", "ADMIN"].includes(role);
};
