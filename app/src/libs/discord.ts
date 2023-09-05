import { NodeHtmlMarkdown } from "node-html-markdown";

export const callDiscordContent = async (
  username: string,
  updated_name: string,
  diff: string[],
  image_url?: string | null
) => {
  return fetch(process.env.DISCORD_CONTENT_UPDATES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatar_url: image_url && image_url.includes("https") ? image_url : "",
      content: `**${username} updated ${updated_name}**\n* ${diff.join("\n* ")}`,
    }),
  });
};

export const callDiscordNews = async (
  username: string,
  title: string,
  content: string,
  image_url?: string | null
) => {
  const nhm = new NodeHtmlMarkdown({}, undefined, undefined);
  return fetch(process.env.DISCORD_NEWS_UPDATES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatar_url: image_url && image_url.includes("https") ? image_url : "",
      content: nhm.translate(`**${title}**\n* ${content} @everyone`),
    }),
  });
};
