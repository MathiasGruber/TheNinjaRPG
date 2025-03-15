// @ts-nocheck
import React, { useEffect, useState, useRef, useCallback } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper, Bold, Italic, List } from "lucide-react";
import { Controller } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { useController } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { BaseSyntheticEvent } from "react";

interface RichInputProps {
  id: string;
  refreshKey?: number;
  label?: string;
  height: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  control: Control<any>;
  onSubmit?: (e?: BaseSyntheticEvent) => void | Promise<void>;
  isDirty?: boolean;
}

interface EmojiClickData {
  emoji: string;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  const { id, disabled, onSubmit, control } = props;
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const onDocumentKeyDown = useCallback((event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !disabled &&
      document.activeElement?.id === id
    ) {
      event.preventDefault();
      const value = (control._formValues[id] || "") as string;
      if (value.trim().length > 0 && onSubmit) {
        onSubmit();
      }
    }
  }, [id, disabled, onSubmit, control._formValues]);

  useEffect(() => {
    if (onSubmit) {
      document.addEventListener("keydown", onDocumentKeyDown);
      return () => {
        document.removeEventListener("keydown", onDocumentKeyDown);
      };
    }
  }, [onDocumentKeyDown, onSubmit]);

  const handleOutsideClick = (e: MouseEvent) => {
    if (emojiRef.current && !emojiRef.current.contains(e.target as HTMLElement)) {
      setEmojiOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const { field } = useController({
    name: id,
    control: control,
    rules: { required: true },
    defaultValue: ''
  });

  return (
    <div className={`${disabled ? "opacity-50" : ""}`}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {props.label}
      </label>
      <div className="relative">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => {
              const textarea = document.getElementById(id) as HTMLTextAreaElement;
              if (!textarea) return;
              
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const text = textarea.value;
              
              const selectedText = text.substring(start, end);
              const newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
              
              field.onChange(newText);
              
              // Restore cursor position
              setTimeout(() => {
                textarea.selectionStart = start + 2;
                textarea.selectionEnd = end + 2;
                textarea.focus();
              }, 0);
            }}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const textarea = document.getElementById(id) as HTMLTextAreaElement;
              if (!textarea) return;
              
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const text = textarea.value;
              
              const selectedText = text.substring(start, end);
              const newText = text.substring(0, start) + `*${selectedText}*` + text.substring(end);
              
              field.onChange(newText);
              
              // Restore cursor position
              setTimeout(() => {
                textarea.selectionStart = start + 1;
                textarea.selectionEnd = end + 1;
                textarea.focus();
              }, 0);
            }}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const textarea = document.getElementById(id) as HTMLTextAreaElement;
              if (!textarea) return;
              
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const text = textarea.value;
              
              const selectedText = text.substring(start, end);
              const newText = text.substring(0, start) + `\n- ${selectedText}` + text.substring(end);
              
              field.onChange(newText);
              
              // Restore cursor position
              setTimeout(() => {
                textarea.selectionStart = start + 3;
                textarea.selectionEnd = end + 3;
                textarea.focus();
              }, 0);
            }}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <Controller
          key={props.refreshKey}
          name={id}
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Textarea
              {...field}
              id={id}
              autoFocus
              isDirty={props.isDirty}
              placeholder={props.placeholder}
              className="w-full pr-24"
            />
          )}
        />

        <div
          className="z-50 absolute top-0 left-[50%] translate-x-[-50%]"
          ref={emojiRef}
        >
          <EmojiPicker
            open={emojiOpen}
            lazyLoadEmojis={true}
            onEmojiClick={(emojiData: EmojiClickData) => {
              const textarea = document.getElementById(id) as HTMLTextAreaElement;
              if (!textarea) return;
              
              const start = textarea.selectionStart;
              const text = textarea.value;
              const newText = text.substring(0, start) + emojiData.emoji + text.substring(start);
              
              field.onChange(newText);
              
              // Restore cursor position after emoji
              setTimeout(() => {
                textarea.selectionStart = start + emojiData.emoji.length;
                textarea.selectionEnd = start + emojiData.emoji.length;
                textarea.focus();
              }, 0);
              
              setEmojiOpen(false);
            }}
            style={{
              "--epr-emoji-gap": "2px",
              "--epr-emoji-size": "16px",
            } as React.CSSProperties}
          />
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <PartyPopper
            className="h-5 w-5 text-gray-400 hover:cursor-pointer hover:text-gray-600"
            onClick={() => setEmojiOpen(!emojiOpen)}
          />
          {onSubmit && (
            <SendHorizontal
              className="h-5 w-5 text-gray-400 hover:cursor-pointer hover:text-gray-600"
              onClick={() => {
                const value = field.value as string;
                if (value?.trim().length > 0 && onSubmit) {
                  onSubmit();
                }
              }}
            />
          )}
        </div>
      </div>

      {props.error && <div className="text-xs italic text-red-500">{props.error}</div>}
    </div>
  );
};

export default RichInput;
