import React, { useEffect, useState, useRef, useCallback } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper, Bold, Italic, List } from "lucide-react";
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

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(editorRef.current!);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      return {
        start: preSelectionRange.toString().length,
        end: preSelectionRange.toString().length + range.toString().length
      };
    }
    return null;
  };

  const restoreSelection = (savedSelection: { start: number; end: number } | null) => {
    if (!savedSelection || !editorRef.current) return;
    
    const range = document.createRange();
    const sel = window.getSelection();
    let charIndex = 0;
    let foundStart = false;
    let foundEnd = false;
    
    range.selectNodeContents(editorRef.current);
    range.collapse(true);
    
    function traverse(node: Node) {
      if (foundEnd) return;
      
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const nextCharIndex = charIndex + textNode.length;
        if (!foundStart && savedSelection.start >= charIndex && savedSelection.start <= nextCharIndex) {
          range.setStart(textNode, savedSelection.start - charIndex);
          foundStart = true;
        }
        if (!foundEnd && savedSelection.end >= charIndex && savedSelection.end <= nextCharIndex) {
          range.setEnd(textNode, savedSelection.end - charIndex);
          foundEnd = true;
        }
        charIndex = nextCharIndex;
      } else {
        for (const childNode of Array.from(node.childNodes)) {
          traverse(childNode);
        }
      }
    }
    
    traverse(editorRef.current);
    
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    const content = editorRef.current?.innerHTML || '';
    field.onChange(content);
  };

  const onDocumentKeyDown = useCallback((event: KeyboardEvent) => {
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
      if (value.trim().length > 0 && props.onSubmit) {
        props.onSubmit(value);
      }
    }
  }, [props.disabled, props.id, props.onSubmit]);

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
    defaultValue: ''
  });

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    // Handle images
    for (const item of Array.from(items)) {
      if (item.type.includes('image')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (!editorRef.current) return;
            const img = document.createElement('img');
            img.src = e.target?.result as string;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.insertNode(img);
              range.collapse(false);
            } else {
              editorRef.current.appendChild(img);
            }
            field.onChange(editorRef.current.innerHTML);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
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
              className="min-h-[100px] focus:outline-none p-2 border rounded bg-white"
              onInput={(e) => {
                const selection = saveSelection();
                const content = e.currentTarget.innerHTML;
                field.onChange(content);
                if (selection) {
                  requestAnimationFrame(() => {
                    restoreSelection(selection);
                  });
                }
              }}
              onPaste={handlePaste}
              dangerouslySetInnerHTML={{ __html: (field.value as string) || '' }}
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
              const selection = window.getSelection();
              const range = selection?.getRangeAt(0);
              if (range) {
                range.deleteContents();
                range.insertNode(document.createTextNode(emojiData.emoji));
                range.collapse(false);
                const content = editorRef.current?.innerHTML || '';
                field.onChange(content);
              }
              setEmojiOpen(false);
            }}
            style={{
              "--epr-emoji-gap": "2px",
              "--epr-emoji-size": "16px",
            } as React.CSSProperties}
          />
        </div>

        <div className="flex flex-row items-center justify-end gap-2 mt-2">
          <PartyPopper
            className="h-6 w-6 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
            onClick={() => setEmojiOpen(!emojiOpen)}
          />
          {props.onSubmit && (
            <SendHorizontal
              className="h-6 w-6 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
              onClick={() => {
                const value = editorRef.current?.innerHTML || '';
                if (value.trim().length > 0 && props.onSubmit) {
                  props.onSubmit(value);
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
