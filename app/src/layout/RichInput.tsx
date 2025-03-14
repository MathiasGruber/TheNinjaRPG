import React, { useEffect, useState, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper } from "lucide-react";
import { Controller } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { useController } from "react-hook-form";
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
  isDirty?: boolean;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  // Reference for emoji element
  const emojiRef = useRef<HTMLDivElement | null>(null);

  // Is emoji popover open
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Handle button clicks
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter":
        if (
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !props.disabled &&
          document.activeElement?.id === props.id
        ) {
          event.preventDefault();
          const value = (props.control._formValues[props.id] || "") as string;
          if (props.onSubmit) props.onSubmit(value);
          event.preventDefault();
        }
        break;
    }
  };

  // Add button handler
  useEffect(() => {
    if (props.onSubmit) {
      document.addEventListener("keydown", onDocumentKeyDown);
      return () => {
        document.removeEventListener("keydown", onDocumentKeyDown);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler for clicks outside emoji selector
  const handleOutsideClick = (e: MouseEvent) => {
    if (emojiRef.current && !emojiRef.current.contains(e.target as HTMLElement)) {
      setEmojiOpen(false);
    }
  };

  // Handle clicks outside of the emoji element
  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  });

  const { field } = useController({
    name: props.id,
    control: props.control,
    rules: { required: true },
  });

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || (window as any).clipboardData;
    let pastedHTML = clipboardData.getData("text/html") || clipboardData.getData("text/plain");
  
    // Sanitize input: Remove <script> and other unsafe tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(pastedHTML, "text/html");
  
    // Remove all <script> tags
    const scripts = doc.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i]) {
        scripts[i].remove();
      }
    }
    
    // Get sanitized inner HTML
    pastedHTML = doc.body.innerHTML;
  
    // Handle image pasting separately
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
  
      // Ensure 'item' is defined before accessing its properties
      if (item && item.type && item.type.indexOf("image") !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
  
          reader.onload = (event) => {
            const imgTag = `<img src="${event.target?.result}" style="max-width: 100%;" />`;
            if (contentRef.current) {
              contentRef.current.innerHTML += imgTag;
              field.onChange(contentRef.current.innerHTML);
            }
          };
  
          reader.readAsDataURL(blob);
        }
        return;
      }
    }
  
    // Safely insert sanitized content
    document.execCommand("insertHTML", false, pastedHTML);
  };

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
          rules={{ required: true }}
          render={({ field }) => {
            return (
              <div
                ref={contentRef}
                contentEditable={!props.disabled}
                role="textbox"
                id={props.id}
                className="w-full p-2 border rounded-md bg-white min-h-[100px] overflow-auto focus:outline-none focus:ring focus:ring-orange-500"
                style={{ minHeight: props.height }}
                onInput={(e) => field.onChange((e.target as HTMLDivElement).innerHTML)}
                onBlur={() => props.onSubmit?.(field.value)}
                onPaste={handlePaste}
                dangerouslySetInnerHTML={{ __html: field.value || props.placeholder || "" }}
              />
            );
          }}
        />

        <div
          className="z-50 absolute top-0 left-[50%] translate-x-[-50%]"
          ref={emojiRef}
        >
          <EmojiPicker
            open={emojiOpen}
            lazyLoadEmojis={true}
            onEmojiClick={(emojiData) => {
              const current = (field.value as string) || "";
              field.onChange(current + emojiData.emoji);
              setEmojiOpen(false);
            }}
            style={
              {
                "--epr-emoji-gap": "2px",
                "--epr-emoji-size": "16px",
              } as React.CSSProperties
            }
          />
        </div>

        <div className="flex flex-row items-center absolute top-[50%] translate-y-[-50%] right-5">
          <PartyPopper
            className="h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
            onClick={() => setEmojiOpen(!emojiOpen)}
          />
          {props.onSubmit && (
            <SendHorizontal
              className="h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
              onClick={(e) => props.onSubmit && props.onSubmit(e)}
            />
          )}
        </div>
      </div>

      {props.error && <div className="text-xs italic text-red-500"> {props.error}</div>}
    </div>
  );
};

export default RichInput;
