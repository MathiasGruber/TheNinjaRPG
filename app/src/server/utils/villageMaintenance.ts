import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import {
  VILLAGE_MAINTAINED_STRUCTURE_ROUTES,
  VILLAGE_STRUCTURE_MONTHLY_COST,
} from "@/drizzle/constants";
import { village } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { getUtcMonthDistance, getUtcMonthKey } from "@/utils/time";

export const accrueVillageStructureMaintenance = async (
  client: DrizzleClient,
  now = new Date(),
) => {
  const month = getUtcMonthKey(now);
  const villages = await client.query.village.findMany({
    columns: { id: true, structureMaintenanceMonth: true },
    with: { structures: { columns: { route: true, level: true } } },
    where: eq(village.type, "VILLAGE"),
  });
  await Promise.all(
    villages.map(async (entry) => {
      const previous = entry.structureMaintenanceMonth;
      if (previous && previous >= month) return;
      const structureCount = entry.structures.filter(
        (structure) =>
          structure.level > 0 &&
          (VILLAGE_MAINTAINED_STRUCTURE_ROUTES as readonly string[]).includes(
            structure.route,
          ),
      ).length;
      // A newly created village starts its first full billing period now, without retroactive fees.
      const fee = previous
        ? structureCount *
          VILLAGE_STRUCTURE_MONTHLY_COST *
          getUtcMonthDistance(previous, month)
        : 0;
      await client
        .update(village)
        .set({
          structureMaintenanceDue: sql`${village.structureMaintenanceDue} + ${fee}`,
          structureMaintenanceMonth: month,
        })
        .where(
          and(
            eq(village.id, entry.id),
            previous
              ? eq(village.structureMaintenanceMonth, previous)
              : isNull(village.structureMaintenanceMonth),
          ),
        );
    }),
  );
  // Automatic payment retries hourly. Accrual is durable and month-guarded, so a partial run is safe to retry.
  const paid = await client
    .update(village)
    .set({
      tokens: sql`${village.tokens} - ${village.structureMaintenanceDue}`,
      structureMaintenanceDue: 0,
    })
    .where(
      and(
        eq(village.type, "VILLAGE"),
        gt(village.structureMaintenanceDue, 0),
        gte(village.tokens, village.structureMaintenanceDue),
      ),
    );
  return { paid: paid.rowsAffected };
};
