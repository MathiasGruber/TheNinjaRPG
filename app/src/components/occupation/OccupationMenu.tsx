import { Button } from "@/components/ui/button";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { calcMedninRank } from "@/libs/hospital/hospital";
import type { UserWithRelations } from "@/server/api/routers/profile";

interface OccupationMenuProps {
  userData: NonNullable<UserWithRelations>;
  updateUser: (data: Partial<UserWithRelations>) => Promise<void>;
}

export const OccupationMenu: React.FC<OccupationMenuProps> = ({
  userData,
  updateUser,
}) => {
  // Mutations
  const { mutate: signUpMedicalNinja, isPending: isSigningUp } = api.occupation.signUpMedicalNinja.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success) {
        await updateUser({
          occupation: "MEDICAL_NINJA",
        });
      }
    },
  });

  const { mutate: quitOccupation, isPending: isQuitting } = api.occupation.quitOccupation.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success) {
        await updateUser({
          occupation: "NONE",
        });
      }
    },
  });

  const medicalRank = calcMedninRank(userData);

  return (
    <div className="p-3">
      <h2 className="text-lg font-bold mb-4">Occupations</h2>
      <div className="grid grid-cols-1 gap-4">
        <div className="border p-4 rounded-lg">
          <h3 className="text-md font-semibold mb-2">Medical Ninja</h3>
          <p className="mb-2">
            Medical Ninjas can heal others in the hospital and receive a 30% discount on items.
            {medicalRank === "LEGENDARY" && (
              <span> Legendary Medical Ninjas can also heal Chakra and Stamina.</span>
            )}
          </p>
          {userData.occupation === "MEDICAL_NINJA" ? (
            <>
              <p className="mb-2">Current Medical Rank: {medicalRank}</p>
              <Button
                disabled={isQuitting}
                onClick={() => quitOccupation()}
                variant="destructive"
              >
                Quit Medical Ninja
              </Button>
            </>
          ) : (
            <Button
              disabled={isSigningUp}
              onClick={() => signUpMedicalNinja()}
            >
              Sign Up for Medical Ninja
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
