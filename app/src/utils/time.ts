/**
 * Get game time which is the UTC HH:MM:SS timestring
 */
export const getGameTime = () => {
  const now = new Date();
  const hours = now.getUTCHours().toString().padStart(2, "0");
  const minutes = now.getUTCMinutes().toString().padStart(2, "0");
  const seconds = now.getUTCSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Number of seconds passed since the given date
 */
export const secondsPassed = (date: Date) => {
  return Math.floor((new Date().getTime() - date.getTime()) / 1000);
};

/**
 * Current date plus the given number of seconds
 */
export const secondsFromDate = (seconds: number, date: Date) => {
  return new Date(date.getTime() + seconds * 1000);
};

/**
 * Current date plus the given number of seconds
 */
export const secondsFromNow = (seconds: number) => {
  return secondsFromDate(seconds, new Date());
};

/**
 * Return the number of days, hours, minutes and seconds from a given number timestamp in  milliseconds
 */
export const getDaysHoursMinutesSeconds = (countDown: number) => {
  const days = Math.floor(countDown / (1000 * 60 * 60 * 24));
  const hours = Math.floor((countDown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((countDown % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((countDown % (1000 * 60)) / 1000);
  return [days, hours, minutes, seconds] as const;
};

/** Return a string of how much time left */
export const getTimeLeftStr = (
  days: number,
  hours: number,
  minutes: number,
  seconds: number
) => {
  if (days > 0) {
    return `${days} days, ${hours} hours`;
  } else if (hours > 0) {
    return `${hours} hours, ${minutes} mins`;
  } else if (minutes > 0) {
    return `${minutes} mins, ${seconds} secs`;
  } else if (seconds > 0) {
    return `${seconds} secs`;
  }
  return "0 seconds";
};

/**
 * Sleep for x number of milliseconds
 */
export const sleep = (ms: number) => {
  return new Promise((res) => setTimeout(res, ms));
};
