import React, { useEffect, useState, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper, Bold, Italic, List, Image as ImageIcon } from "lucide-react";
import { Controller } from "react-hook-form";
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
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    const content = editorRef.current?.innerHTML || '';
    field.onChange(content);
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !props.disabled &&
      document.activeElement?.id === props.id
    ) {
      event.preventDefault();
      const value = editorRef.current?.innerHTML || "";
      if (props.onSubmit) props.onSubmit(value);
    }
  };

  useEffect(() => {
    if (props.onSubmit) {
      document.addEventListener("keydown", onDocumentKeyDown);
      return () => {
        document.removeEventListener("keydown", onDocumentKeyDown);
      };
    }
  }, [onDocumentKeyDown, props.onSubmit]);

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
    name: props.id,
    control: props.control,
    rules: { required: true },
  });

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    
    for (const item of Array.from(items)) {
      if (item.type.includes('image')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target?.result as string;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            document.execCommand('insertHTML', false, img.outerHTML);
            const content = editorRef.current?.innerHTML || '';
            field.onChange(content);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
    
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const addImage = () => {
    const url = window.prompt('Enter the URL of the image:');
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      document.execCommand('insertHTML', false, img.outerHTML);
      const content = editorRef.current?.innerHTML || '';
      field.onChange(content);
    }
  };

  return (
    <div className={`${props.disabled ? "opacity-50" : ""}`}>
      <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
        {props.label}
      </label>
      <div className="relative border rounded-md p-2">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => executeCommand('bold')}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => executeCommand('italic')}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onClick={() => executeCommand('insertUnorderedList')}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={addImage}
            className="p-1 rounded hover:bg-gray-200"
            type="button"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </div>
        <Controller
          key={props.refreshKey}
          name={props.id}
          control={props.control}
          rules={{ required: true }}
          render={({ field }) => (
            <div
              ref={editorRef}
              id={props.id}
              contentEditable
              className="min-h-[100px] focus:outline-none p-2 border rounded"
              onInput={(e) => field.onChange(e.currentTarget.innerHTML)}
              onPaste={handlePaste}
              dangerouslySetInnerHTML={{ __html: String(field.value) || '' }}
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
            onEmojiClick={(emojiData) => {
              const current = String(field.value) || "";
              field.onChange(current + emojiData.emoji);
              setEmojiOpen(false);
            }}
            style={{
              "--epr-emoji-gap": "2px",
              "--epr-emoji-size": "16px",
            } as React.CSSProperties}
          />
        </div>

        <div className="flex flex-row items-center absolute bottom-2 right-2">
          <PartyPopper
            className="h-6 w-6 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
            onClick={() => setEmojiOpen(!emojiOpen)}
          />
          {props.onSubmit && (
            <SendHorizontal
              className="h-6 w-6 ml-2 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
              onClick={() => props.onSubmit && props.onSubmit(editorRef.current?.innerHTML || '')}
            />
          )}
        </div>
      </div>

      {props.error && <div className="text-xs italic text-red-500">{props.error}</div>}
    </div>
  );
};

export default RichInput;
