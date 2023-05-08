import React from "react";
import { useEffect, useState } from "react";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "../utils/time";

interface CountdownProps {
  targetDate: Date;
  className?: string;
  // NOTE: Careful with this one to avoid infinite loop on re-render
  onFinish?: () => void;
}

const Countdown: React.FC<CountdownProps> = (props) => {
  const targetTime = props.targetDate.getTime();
  const [countDown, setCountDown] = useState(targetTime - new Date().getTime());
  const [countString, setCountString] = useState<string | null>(null);

  useEffect(() => {
    const secondsLeft = targetTime - new Date().getTime();
    const updateString = (secondsLeft: number) => {
      const [days, hours, minutes, seconds] = getDaysHoursMinutesSeconds(secondsLeft);
      if (days + hours + minutes + seconds <= 0) {
        setCountString("Done");
      } else {
        setCountString(getTimeLeftStr(days, hours, minutes, seconds));
      }
    };
    if (!countString) {
      updateString(secondsLeft);
    }
    if (secondsLeft > 0) {
      const interval = setInterval(() => {
        setCountDown(secondsLeft);
        updateString(secondsLeft);
      }, 500);
      return () => clearInterval(interval);
    } else {
      if (props.onFinish) {
        // NOTE: Careful with this one to avoid infinite loop on re-render
        props.onFinish();
      }
    }
  }, [countDown, countString, targetTime, props]);

  return <span className={props.className}>{countString}</span>;
};

export default Countdown;
