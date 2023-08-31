import Button from "./Button";
import type { UseFormRegister } from "react-hook-form";

interface SelectFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  children: React.ReactNode;
  error?: string;
  multiple?: boolean;
  register?: UseFormRegister<any>;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onButtonClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  button?: React.ReactNode;
}

const SelectField: React.FC<SelectFieldProps> = (props) => {
  const border_color = props.error
    ? "border-2 border-red-500"
    : "border border-amber-900";
  return (
    <div className="m-1">
      {props.label && (
        <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
          {props.label}
        </label>
      )}
      <div className="flex flex-row">
        {props.button && (
          <button
            className="items-center py-2.5 border-2 border-amber-900 px-4 text-sm text-center text-white bg-amber-900 rounded-l-lg hover:bg-orange-800"
            type="button"
            onClick={props.onButtonClick}
          >
            {props.button}
          </button>
        )}
        <select
          {...(props.onChange && { onChange: props.onChange })}
          {...(props.register && props.register(props.id))}
          multiple={props.multiple}
          id={props.id}
          className={`text-sm ${border_color} block w-full ${
            props.button ? "rounded-r-lg" : "rounded-lg"
          } bg-gray-50 p-2.5`}
          {...(!props.multiple && { defaultValue: props.placeholder || props.label })}
        >
          {props.placeholder && (
            <option key="---" value="---">
              {props.placeholder}
            </option>
          )}
          {props.children}
        </select>
      </div>
      {props.error && <p className="text-xs italic text-red-500"> {props.error}</p>}
    </div>
  );
};

export default SelectField;
