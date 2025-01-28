import type { RouterOutputs } from "@/server/api/root";

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
  updateUser,
}) => {
  const [squadName, setSquadName] = useState("");
  const [squadImage, setSquadImage] = useState("");

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const createSquadMutation = api.hospital.createMedicalNinjaSquad.useMutation({
    onSuccess: async (result: { success: boolean; message: string }) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });
  const { mutate: createSquad, isPending: isCreating } = createSquadMutation;



  const kickMemberMutation = api.hospital.kickMedicalNinjaSquadMember.useMutation({
    onSuccess: async (result: { success: boolean; message: string }) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });
  const { mutate: kickMember, isPending: isKicking } = kickMemberMutation;

  const promoteLeaderMutation = api.hospital.promoteMedicalNinjaSquadLeader.useMutation({
    onSuccess: async (result: { success: boolean; message: string }) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });
  const { mutate: promoteLeader, isPending: isPromoting } = promoteLeaderMutation;

  const promoteCoLeaderMutation = api.hospital.promoteMedicalNinjaSquadCoLeader.useMutation({
    onSuccess: async (result: { success: boolean; message: string }) => {
      showMutationToast(result);
      await utils.hospital.getMedicalNinjaSquads.invalidate();
    },
  });
  const { mutate: promoteCoLeader, isPending: isPromotingCoLeader } = promoteCoLeaderMutation;

  // Queries
  const squadsQuery = api.hospital.getMedicalNinjaSquads.useQuery(undefined, {
    refetchInterval: 5000,
    enabled: !!userData,
  });
  const { data: squads } = squadsQuery as {
    data?: Array<{
      id: string;
      name: string;
      image: string;
      villageId: string;
      leaderId: string | null;
      coLeaderId: string | null;
      leader: {
        userId: string;
        username: string;
      } | null;
      coLeader: {
        userId: string;
        username: string;
      } | null;
      members: Array<{
        userId: string;
        username: string;
      }>;
    }>;
  };


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
