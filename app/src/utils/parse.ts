import ReactHtmlParser from "react-html-parser";
import { randomString } from "@/libs/random";

/*
 * Parse HTML string into React components
 * @param html - HTML string to parse
 */
export const parseHtml = (html: string) => {
  return ReactHtmlParser(html, {
    transform: (node: { name: string; type: string; attribs: { alt: string } }) => {
      if (
        node.type === "directive" ||
        node.type === "style" ||
        node.type === "script" ||
        (node.type === "tag" && node.name === "body") ||
        (node.type === "tag" && node.name === "html") ||
        (node.type === "tag" && node.name === "meta") ||
        (node.type === "tag" && node.name === "title") ||
        (node.type === "tag" && node.name === "head")
      ) {
        return null;
      } else if (node.type === "tag" && node.name === "img") {
        node.attribs.alt = randomString(10);
      }
    },
  });
};
