import { type UseFormRegister } from "react-hook-form";

interface SelectFieldProps {
  id: string;
  label: string;
  placeholder?: string;
  children: React.ReactNode;
  error?: string;
  register?: UseFormRegister<any>;
}

const SelectField: React.FC<SelectFieldProps> = (props) => {
  const border_color = props.error
    ? "border-2 border-red-500"
    : "border border-amber-900";
  return (
    <div className="m-3">
      <label htmlFor={props.id} className="text-sm mb-2 block font-medium">
        {props.label}
      </label>
      <select
        {...(props.register && props.register(props.id))}
        id={props.id}
        className={`text-sm ${border_color} block w-full rounded-lg bg-gray-50 p-2.5`}
        defaultValue={props.placeholder || props.label}
      >
        {props.placeholder && (
          <option key="---" value="---">
            {props.placeholder}
          </option>
        )}
        {props.children}
      </select>
      {props.error && (
        <p className="text-xs italic text-red-500"> {props.error}</p>
      )}
    </div>
  );
};

export default SelectField;
