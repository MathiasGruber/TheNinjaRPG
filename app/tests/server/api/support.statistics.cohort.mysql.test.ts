import { afterEach, beforeEach, expect, it, setSystemTime } from "bun:test";
import {
  conversation,
  conversationComment,
  supportTicket,
  userData,
} from "@/drizzle/schema";
import { supportRouter } from "@/server/api/routers/support";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  recordQueries,
  resetTables,
} from "../../setup/testDatabase";

const dateFrom = "2026-09-01T12:00:00.000Z";
const dateTo = "2026-10-01T12:00:00.000Z";
const minute = 60_000;

describeWithDatabase("support.getStatistics cohort", () => {
  afterEach(() => setSystemTime());

  beforeEach(async () => {
    setSystemTime(new Date(dateTo));
    await resetTables(supportTicket, conversationComment, conversation, userData);
    await insertUsers([
      { userId: "staff", role: "MODERATOR" },
      { userId: "other-staff", role: "MODERATOR" },
      { userId: "player", role: "USER" },
    ]);
    const database = await getTestDatabase();
    const fixtures = [
      {
        id: "start",
        category: "BUG_REPORT",
        assignee: "staff",
        createdAt: new Date(dateFrom),
        response: 5,
        resolution: 20,
      },
      {
        id: "end",
        category: "BUG_REPORT",
        assignee: "staff",
        createdAt: new Date(dateTo),
        response: null,
        resolution: null,
      },
      {
        id: "other-category",
        category: "GAMEPLAY_QUESTION",
        assignee: "staff",
        createdAt: new Date(dateFrom),
        response: 120,
        resolution: 240,
      },
      {
        id: "other-assignee",
        category: "BUG_REPORT",
        assignee: "other-staff",
        createdAt: new Date(dateFrom),
        response: 60,
        resolution: 180,
      },
      {
        id: "before",
        category: "BUG_REPORT",
        assignee: "staff",
        createdAt: new Date(new Date(dateFrom).getTime() - 1),
        response: 1,
        resolution: 1,
      },
      {
        id: "after",
        category: "BUG_REPORT",
        assignee: "staff",
        createdAt: new Date(new Date(dateTo).getTime() + 1),
        response: 1,
        resolution: 1,
      },
    ] as const;

    await database.insert(conversation).values(fixtures.map(({ id }) => ({ id })));
    await database.insert(supportTicket).values(
      fixtures.map((fixture) => ({
        id: fixture.id,
        title: fixture.id,
        description: "Support statistics fixture",
        category: fixture.category,
        assignedToUserId: fixture.assignee,
        createdAt: fixture.createdAt,
        createdByUserId: "player",
        conversationId: fixture.id,
        status: fixture.resolution === null ? ("OPEN" as const) : ("RESOLVED" as const),
        closedAt:
          fixture.resolution === null
            ? null
            : new Date(fixture.createdAt.getTime() + fixture.resolution * minute),
      })),
    );
    await database.insert(conversationComment).values(
      fixtures.flatMap((fixture) =>
        fixture.response === null
          ? []
          : [
              {
                id: fixture.id,
                conversationId: fixture.id,
                userId: fixture.assignee,
                authorId: fixture.assignee,
                content: "Staff response",
                createdAt: new Date(
                  fixture.createdAt.getTime() + fixture.response * minute,
                ),
              },
            ],
      ),
    );
  });

  it.each([
    {
      filters: { category: "BUG_REPORT" as const, assignedToUserId: "staff" },
      total: 2,
      resolved: 1,
      responseTime: 5,
      resolutionTime: 20,
      rate: 50,
    },
    {
      filters: { category: "BUG_REPORT" as const },
      total: 3,
      resolved: 2,
      responseTime: 33,
      resolutionTime: 100,
      rate: 67,
    },
    {
      filters: { assignedToUserId: "staff" },
      total: 3,
      resolved: 2,
      responseTime: 63,
      resolutionTime: 130,
      rate: 67,
    },
    {
      filters: {},
      total: 4,
      resolved: 3,
      responseTime: 62,
      resolutionTime: 147,
      rate: 75,
    },
  ])(
    "uses the same cohort for counts and metrics: $filters",
    async ({ filters, total, resolved, responseTime, resolutionTime, rate }) => {
      const caller = await callerFor(supportRouter, "staff");
      const result = await caller.getStatistics({ dateFrom, dateTo, ...filters });

      expect(result.totalTickets).toBe(total);
      expect(result.openTickets).toBe(1);
      expect(result.resolvedTickets).toBe(resolved);
      expect(result).toMatchObject({
        averageResponseTime: responseTime,
        averageResolutionTime: resolutionTime,
        firstResponseRate: rate,
        resolutionRate: rate,
      });
    },
  );

  it("preserves the default 30-day cohort", async () => {
    const caller = await callerFor(supportRouter, "staff");
    expect(await caller.getStatistics({})).toEqual(
      await caller.getStatistics({ dateFrom, dateTo }),
    );
  });

  it("returns zero counts and metrics for an empty cohort", async () => {
    const caller = await callerFor(supportRouter, "staff");
    const result = await caller.getStatistics({
      dateFrom,
      dateTo,
      category: "PAYMENT_ISSUE",
    });
    expect(result.totalTickets).toBe(0);
    expect(result).toMatchObject({
      averageResponseTime: 0,
      averageResolutionTime: 0,
      firstResponseRate: 0,
      resolutionRate: 0,
    });
  });

  it("rejects players before querying ticket statistics", async () => {
    const caller = await callerFor(supportRouter, "player");
    const { statements } = await recordQueries(async () => {
      await expect(caller.getStatistics({ dateFrom, dateTo })).rejects.toThrow(
        "Access denied",
      );
    });
    expect(statements.some((statement) => statement.includes("SupportTicket"))).toBe(
      false,
    );
  });
});
