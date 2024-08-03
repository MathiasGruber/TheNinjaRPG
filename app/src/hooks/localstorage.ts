import { useEffect, useState } from "react";

export const useLocalStorage = <T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] => {
  // Get the initial value from local storage
  const getInitialValue = () => {
    const storedValue = localStorage.getItem(key);
    console.log("storedValue", key, storedValue);
    if (storedValue && storedValue !== "undefined") {
      return JSON.parse(storedValue);
    }
    return initialValue;
  };

  // Set the initial value
  const [value, setValue] = useState<T>(getInitialValue);

  // Update the local storage when the value changes
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};
