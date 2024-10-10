import React, { useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "src/libs/shadui";

interface ToggleProps {
  id?: string;
  labelActive?: string;
  labelInactive?: string;
  value?: boolean;
  setShowActive: React.Dispatch<React.SetStateAction<boolean | undefined>>;
  verticalLayout?: boolean;
}

const Toggle: React.FC<ToggleProps> = (props) => {
  // Destructure
  const { id, value, labelActive, labelInactive, setShowActive } = props;

  // State
  const active = labelActive ?? "Unhandled";
  const inactive = labelInactive ?? "Resolved";

  // Set state
  const setState = useCallback(
    (newValue: boolean) => {
      setShowActive(newValue);
      if (id) localStorage.setItem(id, newValue.toString());
    },
    [id, setShowActive],
  );

  // If we do not have a current value, get from localStorage or select first one
  useEffect(() => {
    if (value === undefined && id) {
      const select = localStorage.getItem(id) || "true";
      const newValue = select === "true" ? true : false;
      setState(newValue);
    }
  }, [id, value, setState]);

  // Render
  return (
    <div
      className={cn(
        "flex",
        props.verticalLayout ? "flex-col items-start gap-2" : "flex-row items-center",
      )}
    >
      <Label htmlFor="tag_name" className="mr-2">
        {value ? active : inactive}
      </Label>
      <Switch onCheckedChange={() => setState(!value)} checked={value} />
    </div>
  );
};

export default Toggle;
