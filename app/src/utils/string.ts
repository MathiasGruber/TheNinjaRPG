export const insertComponentsIntoText = (
  str: string,
  replacements: Record<string, React.ReactNode>,
) => {
  const splitRegex = new RegExp(/(\w*)/g);
  const parts = str.split(splitRegex);
  return parts.map((part) => {
    if (replacements.hasOwnProperty(part)) {
      return replacements[part];
    }
    return part;
  });
};

/**
 * Also removes thousands and replace with k, m, b, t, etc.
 * @param num
 * @returns
 */
export const prettyNumber = (num: number) => {
  if (num < 1000) return num;
  if (num < 1000000) return `${Math.floor(num / 1000)}k`;
  if (num < 1000000000) return `${Math.floor(num / 1000000)}m`;
  return `${Math.floor(num / 1000000000)}b`;
};
