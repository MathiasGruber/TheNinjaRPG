import { api } from "@/trpc/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";

export default async function MedicalNinjaSquadPage() {
  const { isKage, isElder, isMedicalNinja } = await api.user.getPermissions.query();
  const squads = await api.medicalNinja.getSquads.query();

  if (!isKage && !isElder && !isMedicalNinja) {
    redirect("/hospital");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Medical Ninja Squads</h1>

      {isKage && (
        <Card className="p-4">
          <h2 className="text-xl font-semibold mb-4">Create Squad</h2>
          <form action={async (formData: FormData) => {
            "use server";
            const name = formData.get("name") as string;
            await api.medicalNinja.createSquad.mutate({ name });
          }} className="flex gap-2">
            <Input
              name="name"
              placeholder="Squad name"
              required
              minLength={3}
              maxLength={50}
              pattern="^[a-zA-Z0-9\s-]+$"
              title="Squad name can only contain letters, numbers, spaces, and hyphens"
            />
            <Button type="submit">Create</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {squads.map((squad) => (
          <Card key={squad.id} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{squad.name}</h3>
              {isKage && (
                <form action={async () => {
                  "use server";
                  await api.medicalNinja.deleteSquad.mutate({ squadId: squad.id });
                }}>
                  <Button variant="destructive" size="sm" type="submit">Delete</Button>
                </form>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <p>
                Leader: {squad.leader?.name ?? "None"}
                {isKage && !squad.leader && (
                  <form action={async (formData: FormData) => {
                    "use server";
                    const userId = formData.get("userId") as string;
                    await api.medicalNinja.setLeader.mutate({ squadId: squad.id, userId });
                  }} className="mt-1 flex gap-2">
                    <Input name="userId" placeholder="User ID" required />
                    <Button type="submit" size="sm">Set</Button>
                  </form>
                )}
              </p>

              <p>
                Co-Leader: {squad.coLeader?.name ?? "None"}
                {(isKage || squad.leaderId === squad.currentUser?.id) && !squad.coLeader && (
                  <form action={async (formData: FormData) => {
                    "use server";
                    const userId = formData.get("userId") as string;
                    await api.medicalNinja.setCoLeader.mutate({ squadId: squad.id, userId });
                  }} className="mt-1 flex gap-2">
                    <Input name="userId" placeholder="User ID" required />
                    <Button type="submit" size="sm">Set</Button>
                  </form>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Members ({squad.members.length}/10):</h4>
              {squad.members.map((member) => (
                <div key={member.userId} className="flex justify-between items-center">
                  <span>{member.user.name}</span>
                  {(isKage || squad.leaderId === squad.currentUser?.id || squad.coLeaderId === squad.currentUser?.id) && (
                    <form action={async () => {
                      "use server";
                      await api.medicalNinja.kickMember.mutate({ squadId: squad.id, userId: member.userId });
                    }}>
                      <Button variant="destructive" size="sm" type="submit">Kick</Button>
                    </form>
                  )}
                </div>
              ))}
            </div>

            {isMedicalNinja && !squad.members.some(m => m.userId === squad.currentUser?.id) && squad.members.length < 10 && (
              <form action={async () => {
                "use server";
                await api.medicalNinja.joinSquad.mutate({ squadId: squad.id });
              }} className="mt-4">
                <Button type="submit" className="w-full">Join Squad</Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
