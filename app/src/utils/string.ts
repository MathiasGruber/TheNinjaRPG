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
