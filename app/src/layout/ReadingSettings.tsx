"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReadingPreferences } from "@/hooks/useReadingPreferences";
import {
  DEFAULT_READING_PREFERENCES,
  READING_OPTIONS,
  type ReadingPreferences,
} from "@/libs/readingPreferences";

export const ReadingSettings = () => {
  const id = useId();
  const { preferences, updatePreferences, isPersisted } = useReadingPreferences();

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-semibold text-sm">
        Reading accessibility
      </h3>
      <p className="text-muted-foreground text-xs">
        Choose what feels comfortable to read. Changes apply immediately. System fonts
        use a fallback if unavailable.
      </p>
      <p className="text-muted-foreground text-xs" role="status">
        {isPersisted
          ? "Preferences are saved in this browser."
          : "Your browser could not save these preferences. They apply temporarily and may reset when you reload."}
      </p>
      {!isPersisted && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updatePreferences(preferences)}
        >
          Try saving again
        </Button>
      )}
      {Object.entries(READING_LABELS).map(([field, label]) => {
        const key = field as keyof ReadingPreferences;
        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Select
              value={preferences[key]}
              onValueChange={(value) =>
                updatePreferences({ ...preferences, [key]: value })
              }
            >
              <SelectTrigger id={`${id}-${key}`} className="h-auto min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {READING_OPTIONS[key].map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      <div className="rounded-md border bg-card p-3 text-card-foreground">
        <p className="font-semibold">Reading preview</p>
        <p>
          Your next mission awaits. Read the briefing, prepare your jutsu, and travel
          safely through Seichi.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto min-h-8 whitespace-normal"
        onClick={() => updatePreferences(DEFAULT_READING_PREFERENCES)}
      >
        Reset reading preferences
      </Button>
    </section>
  );
};

const READING_LABELS = {
  font: "Reading font",
  spacing: "Letter spacing",
  lineHeight: "Line height",
  palette: "Reading colors",
} satisfies Record<keyof ReadingPreferences, string>;
