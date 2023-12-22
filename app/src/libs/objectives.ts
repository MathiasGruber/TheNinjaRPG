import type { AllObjectivesType } from "@/validators/objectives";

export const getObjectiveImage = (objective: AllObjectivesType) => {
  switch (objective.task) {
    case "pvp_kills":
      return { image: "/badges/pvp_kills.webp", title: "PVP kills" };
    case "arena_kills":
      return { image: "/badges/arena_kills.webp", title: "Arena kills" };
    // case "anbu_kills":
    //   return { image: "/badges/anbu_kills.webp", title: "ANBU kills" };
    // case "tournaments_won":
    //   return { image: "/badges/tournaments_won.webp", title: "Tournaments won" };
    // case "village_funds_earned":
    //   return {
    //     image: "/badges/village_funds_earned.webp",
    //     title: "Village Funds Earned",
    //   };
    // case "any_missions_completed":
    // case "any_crimes_completed":
    //   return {
    //     image: "/badges/any_missions_completed.webp",
    //     title: "Completed Missions",
    //   };
    // case "d_missions_completed":
    //   return {
    //     image: "/badges/mission_d.webp",
    //     title: "D-rank Missions",
    //   };
    // case "c_missions_completed":
    //   return {
    //     image: "/badges/mission_c.webp",
    //     title: "C-rank Missions",
    //   };
    // case "b_missions_completed":
    //   return {
    //     image: "/badges/mission_b.webp",
    //     title: "B-rank Missions",
    //   };
    // case "a_missions_completed":
    //   return {
    //     image: "/badges/mission_a.webp",
    //     title: "A-rank Missions",
    //   };
    // case "d_crimes_completed":
    //   return {
    //     image: "/badges/crime_d.webp",
    //     title: "D-rank crimes",
    //   };
    // case "c_crimes_completed":
    //   return {
    //     image: "/badges/crime_c.webp",
    //     title: "C-rank crimes",
    //   };
    // case "b_crimes_completed":
    //   return {
    //     image: "/badges/crime_b.webp",
    //     title: "B-rank crimes",
    //   };
    // case "a_crimes_completed":
    //   return {
    //     image: "/badges/crime_a.webp",
    //     title: "A-rank crimes",
    //   };
    case "minutes_training":
      return {
        image: "/badges/minutes_training.webp",
        title: "Minutes Training",
      };
    case "jutsus_mastered":
      return {
        image: "/badges/jutsu_mastered.webp",
        title: "Jutsus Mastered",
      };
    case "stats_trained":
      return { image: "/badges/stats_trained.webp", title: "Stats Trained" };
    case "days_in_village":
      return { image: "/badges/time_in_village.webp", title: "Days in Village" };
    case "user_level":
      return { image: "/badges/user_level.webp", title: "User Level" };
    // case "students_trained":
    //   return { image: "/badges/students_trained.webp", title: "Time in Village" };
    case "move_to_location":
      return { image: "/badges/move_to_location.webp", title: "Travel" };
    case "collect_item":
      return { image: "/badges/collect_item.webp", title: "Collect Item" };
    case "defeat_opponents":
      return { image: "/badges/defeat_opponents.webp", title: "Defeat" };
    default:
      return { image: "", title: "???" };
  }
};
