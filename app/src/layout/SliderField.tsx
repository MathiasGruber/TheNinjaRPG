import { type UseFormSetValue } from "react-hook-form";
import { type UseFormRegister } from "react-hook-form";
import { PlusCircle, MinusCircle } from "lucide-react";

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
        <MinusCircle
          className="inline-block h-10 w-10 mr-2 fill-orange-100 text-orange-800 hover:fill-orange-600  hover:cursor-pointer"
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
          {...props?.register?.(props.id, { valueAsNumber: true })}
          className="h-5 w-full cursor-pointer appearance-none  rounded-lg bg-orange-200 accent-orange-800"
        />
        <PlusCircle
          className="inline-block h-10 w-10 ml-2 fill-orange-100 text-orange-800 hover:fill-orange-600 hover:cursor-pointer"
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

interface UncontrolledSliderFieldProps {
  id: string;
  label?: string;
  value: number;
  min: number;
  max: number;
  setValue: React.Dispatch<React.SetStateAction<number>>;
}
export const UncontrolledSliderField: React.FC<UncontrolledSliderFieldProps> = (
  props,
) => {
  return (
    <div className="m-1">
      <label htmlFor={props.id} className="mb-2 block font-medium">
        {props.label ? props.label : ""}
      </label>
      <div className="flex flex-row items-center">
        <MinusCircle
          className="inline-block mr-2 h-10 w-10 fill-orange-100 text-orange-800 hover:fill-orange-600 hover:cursor-pointer"
          onClick={() =>
            props.setValue(props.value > props.min ? props.value - 1 : props.value)
          }
        />
        <input
          id={props.id}
          type="range"
          value={props.value}
          min={props.min}
          max={props.max}
          onChange={(e) => props.setValue(parseInt(e.target.value))}
          className="h-5 w-full cursor-pointer appearance-none  rounded-lg bg-orange-200 accent-orange-800"
        />
        <PlusCircle
          className="inline-block ml-2 h-10 w-10 fill-orange-100 text-orange-800 hover:fill-orange-600 hover:cursor-pointer"
          onClick={() =>
            props.setValue(props.value < props.max ? props.value + 1 : props.value)
          }
        />
      </div>
    </div>
  );
};
