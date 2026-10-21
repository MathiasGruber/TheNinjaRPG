import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { UserSearchSchema } from "@/validators/register";
import { userSearchSchema } from "@/validators/register";

/**
 * A hook which enables search in user names based on
 * input in a InputField, but which only searches upon a 500ms
 * delay after the user has stopped typing.
 */
export const useUserSearch = () => {
  // Use form for field
  const form = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "" },
    mode: "all",
  });
  // Watch username field
  const watchUsername = useWatch({
    control: form.control,
    name: "username",
    defaultValue: "",
  });
  const searchTerm = useDebouncedValue(watchUsername);
  return { form, searchTerm };
};
