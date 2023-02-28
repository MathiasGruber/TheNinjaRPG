import React from "react";
import { useEffect, useState } from "react";

interface CountdownProps {
  targetDate: Date;
  className?: string;
}

const Countdown: React.FC<CountdownProps> = (props) => {
  const [days, hours, minutes, seconds] = useCountdown(props.targetDate);
  if (days + hours + minutes + seconds <= 0) {
    return <span className={props.className}>Done</span>;
  } else {
    let countstring = "";
    if (days > 0) {
      countstring = `${days} days, ${hours} hours`;
    } else if (hours > 0) {
      countstring = `${hours} hours, ${minutes} minutes`;
    } else if (minutes > 0) {
      countstring = `${minutes} minutes, ${seconds} seconds`;
    }
    return <span className={props.className}>{countstring}</span>;
  }
};

export default Countdown;

const getReturnValues = (countDown: number) => {
  const days = Math.floor(countDown / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (countDown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const minutes = Math.floor((countDown % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((countDown % (1000 * 60)) / 1000);
  return [days, hours, minutes, seconds] as const;
};

const useCountdown = (targetDate: Date) => {
  const countDownDate = new Date(targetDate).getTime();
  const [countDown, setCountDown] = useState(
    countDownDate - new Date().getTime()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCountDown(countDownDate - new Date().getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [countDownDate]);

  return getReturnValues(countDown);
};
