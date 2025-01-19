"use client";

import { api } from "~/utils/api";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useToast } from "~/components/ui/use-toast";
import type { BaseServerResponse } from "~/server/api/trpc";

export default function OccupationPage() {
  const { toast } = useToast();
  const utils = api.useUtils();
  const { data: user } = api.profile.me.useQuery() as { data: { occupation: string | null } | undefined };

  const { mutate: signUpMedicalNinja } = api.medicalNinja.signUp.useMutation({
    onSuccess: (data: BaseServerResponse) => {
      toast({
        title: data.success ? "Success" : "Error",
        description: data.message,
      });
      void utils.profile.me.invalidate();
    },
  });

  const { mutate: leaveOccupation } = api.medicalNinja.leaveOccupation.useMutation({
    onSuccess: (data: BaseServerResponse) => {
      toast({
        title: data.success ? "Success" : "Error",
        description: data.message,
      });
      void utils.profile.me.invalidate();
    },
  });

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-6 text-2xl font-bold">Occupations</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-4 text-xl font-semibold">Medical Ninja</h2>
          <p className="mb-4">
            Medical ninjas are skilled healers who can restore health to their allies.
            Legendary Medical Ninjas can also restore chakra and stamina.
          </p>
          <p className="mb-4">
            Benefits:
            <ul className="list-inside list-disc">
              <li>Heal other players in the hospital</li>
              <li>20% discount on items</li>
              <li>Join Medical Ninja Squads (Chunin and above)</li>
              <li>Heal allies during scouting (Squad members)</li>
              <li>Restore chakra and stamina (Legendary Medical Nin)</li>
            </ul>
          </p>
          {user?.occupation === "medical_ninja" ? (
            <Button
              variant="destructive"
              onClick={() => leaveOccupation()}
              className="w-full"
            >
              Leave Medical Ninja
            </Button>
          ) : (
            <Button
              onClick={() => signUpMedicalNinja()}
              className="w-full"
              disabled={!!user?.occupation}
            >
              Become Medical Ninja
            </Button>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-4 text-xl font-semibold">Bounty Hunter</h2>
          <p className="mb-4">
            Bounty hunters track down and capture rogue ninjas for rewards.
          </p>
          <p className="mb-4">Coming soon...</p>
          <Button disabled className="w-full">
            Coming Soon
          </Button>
        </Card>
      </div>

      {user?.occupation && (
        <div className="mt-4">
          <Button
            variant="destructive"
            onClick={() => leaveOccupation()}
            className="w-full"
          >
            Leave Current Occupation
          </Button>
        </div>
      )}
    </div>
  );
}
