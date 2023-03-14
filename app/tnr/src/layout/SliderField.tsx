import { type UseFormSetValue } from "react-hook-form";
import { type UseFormRegister } from "react-hook-form";
import { PlusCircleIcon, MinusCircleIcon } from "@heroicons/react/24/solid";

interface SliderFieldProps {
  id: string;
  label?: string;
  default: number;
  min: number;
  max: number;
  unit?: string;
  error?: string;
  watchedValue: number;
  setValue: UseFormSetValue<any>;
  register: UseFormRegister<any>;
}

const SliderField: React.FC<SliderFieldProps> = (props) => {
  return (
    <div className="m-1">
      <label htmlFor={props.id} className="mb-2 block font-medium">
        {props.label ? `${props.label}.` : ""}
        {props.watchedValue
          ? ` Selected: ${props.watchedValue} ${props.unit ? props.unit : ""}`
          : ""}
      </label>
      <div className="flex flex-row items-center">
        <MinusCircleIcon
          className="inline-block h-12 w-12 text-orange-800 hover:fill-orange-600"
          onClick={() =>
            props.watchedValue > props.min
              ? props.setValue(props.id, props.watchedValue - 1)
              : null
          }
        />
        <input
          id={props.id}
          type="range"
          min={props.min}
          max={props.max}
          {...(props.register && props.register(props.id, { valueAsNumber: true }))}
          className="h-5 w-full cursor-pointer appearance-none  rounded-lg bg-orange-200 accent-orange-800"
        />
        <PlusCircleIcon
          className="inline-block h-12 w-12 text-orange-800 hover:fill-orange-600"
          onClick={() =>
            props.watchedValue < props.max
              ? props.setValue(props.id, props.watchedValue + 1)
              : null
          }
        />
      </div>
      {props.error && <p className="text-xs italic text-red-500"> {props.error}</p>}
    </div>
  );
};

export default SliderField;
