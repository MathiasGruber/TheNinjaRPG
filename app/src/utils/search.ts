import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { userSearchSchema } from "../validators/register";
import type { UserSearchSchema } from "../validators/register";

/**
 * A hook which enables search in user names based on
 * input in a InputField, but which only searches upon a 500ms
 * delay after the user has stopped typing.
 */
export const useUserSearch = () => {
  // Search term
  const [searchTerm, setSearchTerm] = useState<string>("");
  // Use form for field
  const form = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "" },
    mode: "all",
  });
  // Watch username field
  const watchUsername = form.watch("username", "");
  // Update search term with delay
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(watchUsername);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchUsername, setSearchTerm]);
  return { form, searchTerm };
};
