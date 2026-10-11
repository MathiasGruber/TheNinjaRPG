import { Flame } from "lucide-react";
import type { AggroDisplay } from "@/libs/combat/aggroDisplay";

export const CombatAggro = ({
  aggro,
  userId,
}: {
  aggro: AggroDisplay;
  userId: string;
}) => {
  const details = aggro.get(userId);
  if (!details) return null;
  return (
    <section className="space-y-1 text-xs" aria-label="Aggro details">
      <div className="flex items-center gap-1 font-semibold text-amber-400">
        <Flame className="h-4 w-4" aria-hidden="true" />
        Aggro{details.isHighest ? " · Highest on team" : ""}
      </div>
      <p className="tabular-nums">
        {details.enmity.toLocaleString(undefined, { maximumFractionDigits: 1 })} enmity
        {" · "}
        {Math.round(details.ratio * 100)}% of highest on team
      </p>
      <p className="text-white/70">AI rules can target highest or lowest aggro.</p>
    </section>
  );
};
