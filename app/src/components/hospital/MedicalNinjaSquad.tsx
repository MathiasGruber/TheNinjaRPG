/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

// TODO: Fix type inference for tRPC mutations and queries
// Currently, the type inference for tRPC mutations and queries is not working correctly
// This is a known issue and will be fixed in a future update
// For now, we need to use type assertions to make TypeScript happy
// See: https://github.com/trpc/trpc/issues/1343

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { showUserRank } from "@/libs/profile";
import { calcMedninRank } from "@/libs/hospital/hospital";
import type { UserWithRelations } from "@/server/api/routers/profile";


interface MedicalNinjaSquadComponentProps {
  userData: NonNullable<UserWithRelations>;
  updateUser: (data: Partial<UserWithRelations>) => Promise<void>;
}

export const MedicalNinjaSquadComponent: React.FC<MedicalNinjaSquadComponentProps> = ({
  userData,
  _updateUser,
}) => {
  const [squadName, setSquadName] = useState("");
  const [squadImage, setSquadImage] = useState("");

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: createSquad, isPending: isCreating } = api.hospital.createMedicalNinjaSquad.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });



  const { mutate: kickMember, isPending: isKicking } = api.hospital.kickMedicalNinjaSquadMember.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });

  const { mutate: promoteLeader, isPending: isPromoting } = api.hospital.promoteMedicalNinjaSquadLeader.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });

  const { mutate: promoteCoLeader, isPending: isPromotingCoLeader } = api.hospital.promoteMedicalNinjaSquadCoLeader.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });

  // Queries
  const { data: squads } = api.hospital.getMedicalNinjaSquads.useQuery(undefined, {
    refetchInterval: 5000,
    enabled: !!userData,
  });

  // Table setup
  type SquadMember = {
    avatar: string;
    info: JSX.Element;
    actions: JSX.Element;
  };

  const columns: ColumnDefinitionType<SquadMember, keyof SquadMember>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "info", header: "Info", type: "jsx" },
    { key: "actions", header: "Actions", type: "jsx" },
  ];

  const isKage = userData.rank === "ELDER";
  const isLeader = squads?.some((s) => s.leaderId === userData.userId);
  const isCoLeader = squads?.some((s) => s.coLeaderId === userData.userId);
  const canManageSquad = isKage || isLeader || isCoLeader;

  const squadMembers = squads?.flatMap((squad) => {
    return squad.members?.map((member) => ({
      avatar: member.avatar,
      info: (
        <div>
          {member.username}
          <span className="hidden sm:inline">
            , Lvl. {member.level} {showUserRank(member)}
          </span>
          <div>Medical Rank: {calcMedninRank(member)}</div>
        </div>
      ),
      actions: canManageSquad ? (
        <div className="grid grid-cols-2 gap-1">
          {(isKage || isLeader) && (
            <>
              <Button
                disabled={isPromoting}
                onClick={() => promoteLeader({ squadId: squad.id, userId: member.userId })}
              >
                Promote Leader
              </Button>
              <Button
                disabled={isPromotingCoLeader}
                onClick={() => promoteCoLeader({ squadId: squad.id, userId: member.userId })}
              >
                Promote Co-Leader
              </Button>
            </>
          )}
          <Button
            disabled={isKicking}
            onClick={() => kickMember({ squadId: squad.id, userId: member.userId })}
          >
            Kick
          </Button>
        </div>
      ) : null,
    }));
  });

  return (
    <div className="p-3">
      {isKage && (
        <div className="mb-4">
          <h3 className="text-lg font-bold">Create Medical Ninja Squad</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="squadName">Squad Name</Label>
              <Input
                id="squadName"
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
                placeholder="Enter squad name"
              />
            </div>
            <div>
              <Label htmlFor="squadImage">Squad Image URL</Label>
              <Input
                id="squadImage"
                value={squadImage}
                onChange={(e) => setSquadImage(e.target.value)}
                placeholder="Enter image URL"
              />
            </div>
          </div>
          <Button
            className="mt-2"
            disabled={isCreating || !squadName || !squadImage}
            onClick={() => createSquad({ name: squadName, image: squadImage })}
          >
            Create Squad
          </Button>
        </div>
      )}

      {squadMembers && squadMembers.length > 0 ? (
        <Table data={squadMembers} columns={columns} />
      ) : (
        <p>No medical ninja squads found.</p>
      )}
    </div>
  );
};
