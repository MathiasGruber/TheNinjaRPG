import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { useUserData } from "@/utils/UserContext";

/**
 * Hook for toggling sleep status.
 * Can be used across multiple pages (home, battle arena, etc.)
 */
export const useSleepToggle = () => {
  const { prepareUserUpdate, updateUser } = useUserData();

  const { mutate: toggleSleep, isPending: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onMutate: prepareUserUpdate,
      onSuccess: async (data, _variables, revision) => {
        if (data.success && data.newStatus) {
          await updateUser({ status: data.newStatus }, { revision });
        } else {
          showMutationToast(data);
        }
      },
    });

  return {
    toggleSleep,
    isTogglingSleep,
  };
};
