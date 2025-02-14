import type { TimeUnit } from "@/drizzle/constants";

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
 * Get time since last reset which is in YYYY-MM-DDTHH:mm:ss.sssZ format
 */
export const getTimeOfLastReset = () => {
  const date = new Date();
  const now_utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
  );
  return new Date(now_utc);
};

/**
 * Number of seconds passed since the given date
 */
export const secondsPassed = (date: Date, timeDiff?: number) => {
  let now = new Date().getTime();
  if (timeDiff) now = now - timeDiff;
  const parsedDate = date instanceof Date ? date : new Date(date);
  return Math.floor((now - parsedDate.getTime()) / 1000);
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
  seconds: number,
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

/**
 * Adds the specified number of days to the given date
 *
 * @param {Date} date - The date to which the days should be added.
 * @param {number} days - The number of days to add.
 * @returns {Date} - The new date after adding the specified number of days.
 */
export const addDays = (date: Date, days: number) => {
  const newDate = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return newDate;
};

export const getCurrentSeason = () => {
  const now = new Date();
  const month = now.getMonth();
  switch (month) {
    case 11:
    case 0:
    case 1:
      return "winter";
    case 2:
    case 3:
    case 4:
      return "spring";
    case 5:
    case 6:
    case 7:
      return "summer";
    case 9:
      return "halloween";
    case 8:
    case 10:
      return "fall";
    default:
      return "summer";
  }
};

export const getMillisecondsFromTimeUnit = (timeUnit: TimeUnit) => {
  switch (timeUnit) {
    case "minutes":
      return 1000 * 60;
    case "hours":
      return 1000 * 60 * 60;
    case "days":
      return 1000 * 60 * 60 * 24;
    case "weeks":
      return 1000 * 60 * 60 * 24 * 7;
    case "months":
      return 1000 * 60 * 60 * 24 * 30;
    default:
      return 1000;
  }
};

/**
 * Get the week number of the given date
 */
export const getWeekNumber = (date: Date) => {
  const yearStart = +new Date(date.getFullYear(), 0, 1);
  const today = +new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = (today - yearStart + 1) / 86400000;
  return Math.ceil(dayOfYear / 7).toString();
};
