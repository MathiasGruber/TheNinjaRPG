import { api } from "~/trpc/server";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";


export default async function OccupationPage() {
  const medicalNinja = await api.medicalNinja.getMedicalNinja.query();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Occupations</h1>

      <Card className="p-4">
        <h2 className="text-xl font-semibold mb-4">Medical Ninja</h2>
        <p className="mb-4">
          Medical ninjas are skilled healers who can treat injuries and restore health to their fellow ninjas.
          As you gain experience, you&apos;ll unlock higher ranks with better abilities.
        </p>

        <div className="mb-4">
          <h3 className="font-semibold mb-2">Ranks and Requirements:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Trainee: No requirements</li>
            <li>Apprentice: 10,000 EXP</li>
            <li>Skilled: 50,000 EXP</li>
            <li>Expert: 150,000 EXP</li>
            <li>Master: 400,000 EXP</li>
            <li>Legendary: 700,000 EXP</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="font-semibold mb-2">Benefits:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>30% discount on all items</li>
            <li>Access to Medical Ninja Squads</li>
            <li>Ability to heal other players in the hospital</li>
            <li>Legendary rank can heal Chakra and Stamina</li>
          </ul>
        </div>

        {medicalNinja ? (
          <div>
            <p className="mb-2">
              Current Rank: <span className="font-semibold">{medicalNinja.rank}</span>
            </p>
            <p className="mb-4">
              Experience: <span className="font-semibold">{medicalNinja.experience}</span>
            </p>
            <form action={async () => {
              "use server";
              await api.medicalNinja.leave.mutate();
            }}>
              <Button variant="destructive" type="submit">Leave Medical Ninja Occupation</Button>
            </form>
          </div>
        ) : (
          <form action={async () => {
            "use server";
            await api.medicalNinja.join.mutate();
          }}>
            <Button type="submit">Join Medical Ninja Occupation</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
