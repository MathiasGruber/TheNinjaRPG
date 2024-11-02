import { NodeHtmlMarkdown } from "node-html-markdown";
import type { TicketType } from "@/validators/misc";
import type { UserData } from "@/drizzle/schema";

export const callDiscordContent = async (
  username: string,
  updated_name: string,
  diff: string[],
  image_url?: string | null,
) => {
  return fetch(process.env.DISCORD_CONTENT_UPDATES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatar_url: image_url?.includes("https") ? image_url : "",
      content: `**${username} updated ${updated_name}**\n* ${diff.join("\n* ")}`,
    }),
  });
};

export const callDiscordNews = async (
  username: string,
  title: string,
  content: string,
  image_url?: string | null,
) => {
  const nhm = new NodeHtmlMarkdown({}, undefined, undefined);
  return fetch(process.env.DISCORD_NEWS_UPDATES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatar_url: image_url?.includes("https") ? image_url : "",
      content: nhm.translate(`**${title}**\n* ${content} @everyone`),
    }),
  });
};

export const callDiscordTicket = async (
  thread_name: string,
  reason: string,
  type: TicketType,
  user: UserData,
) => {
  const nhm = new NodeHtmlMarkdown({}, undefined, undefined);
  const image_url = user.avatar;
  const content = `*Report from TNR interface*\n\n**Username:** ${user.username}\n**Reason:** ${nhm.translate(reason)}\n${type === "content" ? "<@&1131406837762244760>" : "<@&1086822053254017105>"}\n`;
  return fetch(process.env.DISCORD_TICKETS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatar_url: image_url?.includes("https") ? image_url : "",
      content: content,
      username: user.username,
      thread_name,
      embeds: [
        {
          title: "User Information",
          description: `
            **Username:** ${user.username}
            **User ID:** ${user.userId}
            **Role:** ${user.role}
            **Banned**: ${user.isBanned ? "true" : "false"}
            **Silenced**: ${user.isSilenced ? "true" : "false"}
            **Federal Status:** ${user.federalStatus}

            **Level:** ${user.level}
            **Rank:** ${user.rank}
            **Status:** ${user.status}

            **Last update:** ${user.regenAt.toISOString()}`,
          color: 15844367,
        },
      ],
    }),
  });
};
