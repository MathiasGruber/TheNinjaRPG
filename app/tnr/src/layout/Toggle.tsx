import React from "react";

interface ToggleProps {
  value: boolean;
  setShowActive: React.Dispatch<React.SetStateAction<boolean>>;
}

const Toggle: React.FC<ToggleProps> = (props) => {
  return (
    <label className="relative mr-3 inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        value=""
        className="peer sr-only"
        onClick={() => props.setShowActive((prev) => !prev)}
      />
      <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:top-[3px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300"></div>
      <span className="ml-3 text-base text-gray-900">
        {props.value ? "Active" : "Resolved"}
      </span>
    </label>
  );
};

export default Toggle;
