import React from "react";
import { Editor } from "@tinymce/tinymce-react";
import { SendHorizontal } from "lucide-react";
import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";

interface RichInputProps {
  id: string;
  refreshKey?: number;
  label?: string;
  height: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  control: Control<any>;
  onSubmit?: (e: any) => void;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  return (
    <div className={`${props.disabled ? "opacity-50" : ""}`}>
      <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
        {props.label}
      </label>
      <div className="relative">
        <Controller
          key={props.refreshKey}
          name={props.id}
          control={props.control}
          rules={{
            required: true,
          }}
          render={({ field: { onChange, ref } }) => (
            <Editor
              apiKey="rms0hylum5thsurrzmsqdj0zorybr350bgnawqyq4sa6nsue"
              onInit={(evt, editor) => {
                ref(editor);
              }}
              disabled={props.disabled}
              onEditorChange={onChange}
              initialValue={props.placeholder}
              init={{
                skin: "fabric",
                content_css: "fabric",
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
                  "emoticons",
                  "anchor",
                  "searchreplace",
                  "visualblocks",
                  "fullscreen",
                  "insertdatetime",
                  "media",
                  "table",
                  "code",
                  "help",
                ],
                elementpath: false,
                toolbar: "emoticons image media | " + "help",
                content_style:
                  "body { font-family:Helvetica,Arial,sans-serif; font-size:14px }",
                setup: function (ed) {
                  ed.on("keydown", function (e) {
                    if (!e.ctrlKey && !e.shiftKey && e.key === "Enter") {
                      e.preventDefault();
                      if (props.onSubmit) {
                        props.onSubmit(e);
                      }
                    }
                  });
                },
              }}
            />
          )}
        />
        <SendHorizontal
          className="absolute bottom-10 right-5 h-12 w-12 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
          onClick={(e) => props.onSubmit && props.onSubmit(e)}
        />
      </div>

      {props.error && <div className="text-xs italic text-red-500"> {props.error}</div>}
    </div>
  );
};

export default RichInput;
