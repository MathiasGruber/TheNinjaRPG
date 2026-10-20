"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import Modal from "@/layout/Modal";

export const AutoCombatControl = (props: AutoCombatControlProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const switchRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="space-y-2 rounded-lg border bg-popover/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="battle-ai-control">
          AI control: {props.isActive ? "On" : "Off"}
        </Label>
        <Switch
          ref={switchRef}
          id="battle-ai-control"
          aria-label="AI control"
          aria-describedby="battle-ai-control-help"
          checked={props.isActive}
          disabled={props.isPending}
          onCheckedChange={(enabled) => {
            if (enabled && props.requiresConfirmation) setIsConfirming(true);
            else props.onChange(enabled);
          }}
        />
      </div>
      <p id="battle-ai-control-help" className="text-muted-foreground text-sm">
        {props.requiresConfirmation
          ? "Applies to this battle only. New PvP battles start with manual control."
          : "Also sets your auto combat preference for future non-PvP battles."}
      </p>
      {props.error && <p role="alert">{props.error}</p>}
      <Modal
        title="Enable AI control for this battle?"
        isOpen={isConfirming && !props.isActive}
        setIsOpen={setIsConfirming}
        returnFocusRef={switchRef}
        proceed_label="Enable AI control"
        isLoading={props.isPending}
        onAccept={() => props.onChange(true)}
      >
        <p>
          Your AI profile will choose and perform actions immediately using your current
          loadout. Turn AI control off at any time to take control again.
        </p>
        <p>
          This choice applies only to this battle. Your next PvP battle starts manually.
        </p>
      </Modal>
    </div>
  );
};

interface AutoCombatControlProps {
  isActive: boolean;
  isPending: boolean;
  requiresConfirmation: boolean;
  error?: string;
  onChange: (enabled: boolean) => void;
}
