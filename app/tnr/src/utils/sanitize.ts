import sanitizeHtml from "sanitize-html";

const sanitize = (html: string) => {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src"],
      span: ["style"],
    },
  });
};

export default sanitize;
