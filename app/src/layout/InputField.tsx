import { type UseFormRegister } from "react-hook-form";

export interface InputFieldProps {
  id: string;
  disabled?: boolean;
  inline?: boolean;
  label?: string;
  placeholder?: string;
  options?: React.ReactNode;
  type?: "text" | "number";
  error?: string;
  autofocus?: boolean;
  register?: UseFormRegister<any>;
}

const InputField: React.FC<InputFieldProps> = (props) => {
  const border_color = props.error
    ? "border-2 border-red-500"
    : "border border-amber-900";
  return (
    <>
      <div
        className={`${
          props.inline ? "flex flex-row items-center" : "relative grow"
        } m-1 ${props.disabled ? "opacity-50" : ""}`}
      >
        {props.label && (
          <label htmlFor={props.id} className="mb-2 block text-sm font-medium mr-2">
            {props.label}
          </label>
        )}

        <input
          {...(props.autofocus && { autoFocus: true })}
          {...(props.register &&
            props.register(props.id, { valueAsNumber: props.type === "number" }))}
          type={props.type || "text"}
          id={props.id}
          className={`text-sm ${border_color} block w-full rounded-lg bg-gray-50 p-2.5`}
          placeholder={props.placeholder || props.label}
        />
        {props.options}
      </div>
      {props.error && <p className="text-xs italic text-red-500"> {props.error}</p>}
    </>
  );
};

export default InputField;
