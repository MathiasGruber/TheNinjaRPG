import React, { useRef } from "react";
import { Editor } from "@tinymce/tinymce-react";
import { type Control } from "react-hook-form";
import { useController } from "react-hook-form";

interface RichInputProps {
  id: string;
  label?: string;
  height: string;
  placeholder: string;
  error?: string;
  control: Control<any>;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  const editorRef = useRef<any>(null);

  // We need to use useController to control "uncontrolled" inputs
  const {
    field: { onChange, ...field },
  } = useController({ name: props.id, control: props.control });

  return (
    <div className="m-1">
      <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
        {props.label}
      </label>
      <Editor
        apiKey="rms0hylum5thsurrzmsqdj0zorybr350bgnawqyq4sa6nsue"
        onInit={(evt, editor) => (editorRef.current = editor)}
        {...field}
        onEditorChange={onChange}
        initialValue={props.placeholder}
        init={{
          height: props.height,
          menubar: false,
          branding: false,
          plugins: [
            "advlist",
            "autolink",
            "lists",
            "link",
            "image",
            "charmap",
            "preview",
            "anchor",
            "searchreplace",
            "visualblocks",
            "fullscreen",
            "insertdatetime",
            "media",
            "table",
            "code",
            "help",
            "wordcount",
          ],
          toolbar:
            "undo redo | blocks | " +
            "bold italic forecolor | alignleft aligncenter " +
            "alignright alignjustify | bullist numlist outdent indent | " +
            "removeformat | help",
          content_style:
            "body { font-family:Helvetica,Arial,sans-serif; font-size:14px }",
        }}
      />
      {props.error && (
        <p className="text-xs italic text-red-500"> {props.error}</p>
      )}
    </div>
  );
};

export default RichInput;
