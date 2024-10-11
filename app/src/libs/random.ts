/**
 * A consistent not-random number generator between 0 and 1
 */
export const consistentRandNumber = (i: number) => {
  const x = Math.sin(i++) * 10000;
  return x - Math.floor(x);
};

/**
 * Return a random string of the given length
 */
export const randomString = (length: number) => {
  let result = "";
  const characters = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};
