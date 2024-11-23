[1mdiff --git a/app/src/server/api/routers/clan.ts b/app/src/server/api/routers/clan.ts[m
[1mindex c5144aae..38ca2d9b 100644[m
[1m--- a/app/src/server/api/routers/clan.ts[m
[1m+++ b/app/src/server/api/routers/clan.ts[m
[36m@@ -444,6 +444,7 @@[m [mexport const clanRouter = createTRPCRouter({[m
         return errorResponse("Rank too low");[m
       }[m
       // Start the battle[m
[32m+[m[32m      const background = await determineArenaBackground(ctx.drizzle, village.name);[m
       return await initiateBattle([m
         {[m
           userIds: [ctx.userId],[m
[36m@@ -451,7 +452,7 @@[m [mexport const clanRouter = createTRPCRouter({[m
           client: ctx.drizzle,[m
         },[m
         "CLAN_CHALLENGE",[m
[31m-        determineArenaBackground(village.name),[m
[32m+[m[32m        background,[m
       );[m
     }),[m
   toBank: protectedProcedure[m
[36m@@ -762,6 +763,7 @@[m [mexport const clanRouter = createTRPCRouter({[m
         return errorResponse("Clan battle not started yet");[m
       }[m
       // Start the battle[m
[32m+[m[32m      const background = await determineArenaBackground(ctx.drizzle, "default");[m
       const result = await initiateBattle([m
         {[m
           userIds: challengerIds,[m
[36m@@ -769,7 +771,7 @@[m [mexport const clanRouter = createTRPCRouter({[m
           client: ctx.drizzle,[m
         },[m
         "CLAN_BATTLE",[m
[31m-        determineArenaBackground("default"),[m
[32m+[m[32m        background,[m
       );[m
 [m
       if (result.success && result.battleId) {[m
[1mdiff --git a/app/src/server/api/routers/kage.ts b/app/src/server/api/routers/kage.ts[m
[1mindex 9f97ad80..fb5ed503 100644[m
[1m--- a/app/src/server/api/routers/kage.ts[m
[1m+++ b/app/src/server/api/routers/kage.ts[m
[36m@@ -45,6 +45,7 @@[m [mexport const kageRouter = createTRPCRouter({[m
       if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");[m
       if (previousCount >= KAGE_MAX_DAILIES) return errorResponse("Max for today");[m
       // Start the battle[m
[32m+[m[32m      const background = determineArenaBackground(ctx.drizzle, village.name);[m
       return await initiateBattle([m
         {[m
           userIds: [ctx.userId],[m
[36m@@ -52,7 +53,7 @@[m [mexport const kageRouter = createTRPCRouter({[m
           client: ctx.drizzle,[m
         },[m
         "KAGE_CHALLENGE",[m
[31m-        determineArenaBackground(village?.name || "Unknown"),[m
[32m+[m[32m        background,[m
       );[m
     }),[m
   resignKage: protectedProcedure[m
[1mdiff --git a/app/src/server/api/routers/sparring.ts b/app/src/server/api/routers/sparring.ts[m
[1mindex 4bd49dc3..1304c967 100644[m
[1m--- a/app/src/server/api/routers/sparring.ts[m
[1m+++ b/app/src/server/api/routers/sparring.ts[m
[36m@@ -59,6 +59,7 @@[m [mexport const sparringRouter = createTRPCRouter({[m
         return errorResponse("Challenge not pending");[m
       }[m
       // Mutate[m
[32m+[m[32m      const background = await determineArenaBackground(ctx.drizzle, "default");[m
       const result = await initiateBattle([m
         {[m
           sector: user.sector,[m
[36m@@ -67,7 +68,7 @@[m [mexport const sparringRouter = createTRPCRouter({[m
           client: ctx.drizzle,[m
         },[m
         "SPARRING",[m
[31m-        determineArenaBackground("default"),[m
[32m+[m[32m        background,[m
       );[m
       if (result.success) {[m
         await updateRequestState(ctx.drizzle, input.id, "ACCEPTED", "SPAR");[m
[1mdiff --git a/app/src/server/api/routers/tournament.ts b/app/src/server/api/routers/tournament.ts[m
[1mindex 34c4ebff..dfca08ac 100644[m
[1m--- a/app/src/server/api/routers/tournament.ts[m
[1m+++ b/app/src/server/api/routers/tournament.ts[m
[36m@@ -239,6 +239,7 @@[m [mexport const tournamentRouter = createTRPCRouter({[m
       // Start the battle[m
       let result: BaseServerResponse | undefined;[m
       if (matchData.userId1 && matchData.userId2) {[m
[32m+[m[32m        const background = await determineArenaBackground(ctx.drizzle, "default");[m
         result = await initiateBattle([m
           {[m
             userIds: [matchData.userId2],[m
[36m@@ -246,7 +247,7 @@[m [mexport const tournamentRouter = createTRPCRouter({[m
             client: ctx.drizzle,[m
           },[m
           "TOURNAMENT",[m
[31m-          determineArenaBackground("default"),[m
[32m+[m[32m          background,[m
         );[m
       }[m
       // We we failed to create battle, let this user win by default[m
[1mdiff --git a/app/src/server/api/routers/travel.ts b/app/src/server/api/routers/travel.ts[m
[1mindex 455fc5b4..0c5ef7bd 100644[m
[1m--- a/app/src/server/api/routers/travel.ts[m
[1m+++ b/app/src/server/api/routers/travel.ts[m
[36m@@ -235,6 +235,7 @@[m [mexport const travelRouter = createTRPCRouter({[m
           if (relation?.status === "ENEMY") {[m
             const chance = structureBoost("patrolsPerLvl", sectorVillage.structures);[m
             if (Math.random() < (travelLength * chance) / 100) {[m
[32m+[m[32m              const background = await determineCombatBackground(ctx.drizzle, "ground");[m
               const battle = await initiateBattle([m
                 {[m
                   longitude: longitude,[m
[36m@@ -246,7 +247,7 @@[m [mexport const travelRouter = createTRPCRouter({[m
                   scaleTarget: true,[m
                 },[m
                 "VILLAGE_PROTECTOR",[m
[31m-                determineCombatBackground("ground"),[m
[32m+[m[32m                background,[m
               );[m
               if (battle.success) {[m
                 return { success: true, message: "Attacked by village protector" };[m
