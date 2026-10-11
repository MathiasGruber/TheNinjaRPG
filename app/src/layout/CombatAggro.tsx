import { Progress } from "@/components/ui/progress";
import { COMBAT_ENMITY_PER_DAMAGE } from "@/drizzle/constants";
import { stillInBattle } from "@/libs/combat/actions";
import type { ReturnedBattle } from "@/libs/combat/types";

export const CombatAggro = ({
  battle,
  userId,
}: {
  battle: ReturnedBattle;
  userId?: string;
}) => {
  const viewer = battle.usersState.find((user) => user.userId === userId);
  const combatants = battle.usersState.filter(
    (user) => !user.hidden && stillInBattle(user),
  );
  const sides = ["left", "right"] as const;
  return (
    <section
      aria-label="Aggro meter"
      className="mt-2 space-y-3 rounded-lg border bg-card p-3 text-card-foreground"
    >
      <div>
        <h3 className="font-semibold text-sm">Aggro meter</h3>
        <p className="text-muted-foreground text-xs">
          {COMBAT_ENMITY_PER_DAMAGE} enmity per HP damage dealt. AI rules can target
          highest or lowest enmity.
        </p>
      </div>
      {sides.map((side) => {
        const users = combatants
          .filter((user) => user.direction === side)
          .sort((a, b) => (b.enmity ?? 0) - (a.enmity ?? 0));
        if (!users.length) return null;
        const highest = Math.max(...users.map((user) => user.enmity ?? 0));
        return (
          <div key={side} className="space-y-2">
            <p className="font-medium text-muted-foreground text-xs">
              {viewer
                ? side === viewer.direction
                  ? "Your team"
                  : "Opponents"
                : side === "left"
                  ? "Left team"
                  : "Right team"}
            </p>
            {users.map((user) => (
              <div key={user.userId} className="space-y-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    {user.username}
                    {user.userId === userId ? " (you)" : ""}
                    {highest > 0 && user.enmity === highest ? " · Highest" : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {(user.enmity ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </div>
                <Progress
                  value={highest > 0 ? ((user.enmity ?? 0) / highest) * 100 : 0}
                  aria-label={`${user.username} enmity relative to highest on team`}
                  aria-valuenow={highest > 0 ? ((user.enmity ?? 0) / highest) * 100 : 0}
                  aria-valuetext={`${(user.enmity ?? 0).toFixed(1)} enmity`}
                />
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
};
