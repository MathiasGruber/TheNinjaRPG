import { useState, useEffect } from "react";
import { type UseFormRegister } from "react-hook-form";

interface InputFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  register?: UseFormRegister<any>;
  onEndEditing?: (input: string) => void;
}

const InputField: React.FC<InputFieldProps> = (props) => {
  const [searchTerm, setSearchTerm] = useState("");
  const { onEndEditing } = props;

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      onEndEditing && onEndEditing(searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, onEndEditing]);

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

      <input
        {...(props.register && props.register(props.id))}
        {...(props.onEndEditing
          ? { onChange: (e) => setSearchTerm(e.target.value) }
          : {})}
        type={props.type || "text"}
        id={props.id}
        className={`text-sm ${border_color} block w-full rounded-lg bg-gray-50 p-2.5`}
        placeholder={props.placeholder || props.label}
      />
      {props.error && (
        <p className="text-xs italic text-red-500"> {props.error}</p>
      )}
    </div>
  );
};

export default InputField;
