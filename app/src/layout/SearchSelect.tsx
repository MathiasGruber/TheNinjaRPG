"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Select one catalog ID with searchable labels, closing the popover on selection.
 * Values remain stable IDs; an empty value can represent the caller's reset option.
 * Trigger attributes let FormControl connect field errors and focus to the button.
 */
export function SearchSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
  ...triggerProps
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
} & Pick<
  ComponentProps<typeof Button>,
  "id" | "aria-invalid" | "aria-describedby" | "ref"
>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...triggerProps}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open && !disabled}
          disabled={disabled}
          className="w-full min-w-0 justify-between"
        >
          <span className="truncate">
            {options.find((option) => option.value === value)?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        {/* Reserve the popover's borders so search stays visible as results scroll. */}
        <Command
          label={`Search ${label.toLowerCase()}`}
          className="max-h-[calc(var(--radix-popover-content-available-height)-2px)]"
        >
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value || "all"}
                  keywords={[option.label]}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  {value === option.value && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
