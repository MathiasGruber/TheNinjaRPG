import { useState } from "react";
import { type UseFormRegister } from "react-hook-form";
import { PlusCircleIcon, MinusCircleIcon } from "@heroicons/react/24/solid";

interface SliderFieldProps {
  id: string;
  label: string;
  default: number;
  min: number;
  max: number;
  unit?: string;
  error?: string;
  register?: UseFormRegister<any>;
}

const SliderField: React.FC<SliderFieldProps> = (props) => {
  const [value, setValue] = useState(props.default);

  return (
    <div className="m-1">
      <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
        {props.label}. Current value: {value} {props.unit}
      </label>
      <div className="flex flex-row items-center">
        <MinusCircleIcon
          className="inline-block h-12 w-12 text-orange-800 hover:fill-orange-600"
          onClick={() =>
            setValue((prev) => (prev > props.min ? prev - 1 : prev))
          }
        />
        <input
          id={props.id}
          type="range"
          min={props.min}
          max={props.max}
          value={value}
          {...(props.register &&
            props.register(props.id, { valueAsNumber: true }))}
          onChange={(e) => setValue(e.target.valueAsNumber)}
          className="h-5 w-full cursor-pointer appearance-none  rounded-lg bg-orange-200 accent-orange-800"
        />
        <PlusCircleIcon
          className="inline-block h-12 w-12 text-orange-800 hover:fill-orange-600"
          onClick={() =>
            setValue((prev) => (prev < props.max ? prev + 1 : prev))
          }
        />
      </div>
      {props.error && (
        <p className="text-xs italic text-red-500"> {props.error}</p>
      )}
    </div>
  );
};

export default SliderField;
