import { useEffect } from "react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AttackMethods,
  AttackTargets,
  ItemRarities,
  ItemSlotTypes,
  ItemTypes,
} from "@/drizzle/constants";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { effectFilters } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchJutsuSchema } from "@/validators/jutsu";
import { Filter } from "lucide-react";
import Toggle from "@/components/control/Toggle";
import { useUserData } from "@/utils/UserContext";
import { canSeeSecretData } from "@/utils/permissions";
import type { SearchJutsuSchema } from "@/validators/jutsu";
import type { EffectType } from "@/libs/train";
import type { AttackTarget, ItemType, AttackMethod } from "@/drizzle/constants";
import type { ItemRarity, ItemSlotType } from "@/drizzle/schema";

interface ItemFilteringProps {
  state: ItemFilteringState;
}

const ItemFiltering: React.FC<ItemFilteringProps> = (props) => {
  // Global state
  const { data: userData } = useUserData();

  // Destructure the state
  const { setOnlyInShop, setEventItems } = props.state;
  const { setName, setEffect, setHidden } = props.state;
  const { setItemType, setRarity, setSlot, setMethod, setTarget } = props.state;

  const { itemType, itemRarity, slot, method, target } = props.state;
  const { onlyInShop, eventItems } = props.state;
  const { name, effect, hidden } = props.state;

  // Name search schema
  const form = useForm<SearchJutsuSchema>({
    resolver: zodResolver(searchJutsuSchema),
    defaultValues: { name: name },
  });
  const watchName = form.watch("name", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id="filter-item">
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid grid-cols-2 gap-1 gap-x-3">
          {/* item NAME */}
          <div>
            <Form {...form}>
              <Label htmlFor="rank">Name</Label>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Search item" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>
          {/* Element */}
          {/* <div>
            <Label htmlFor="element">Elements</Label>
            <MultiSelect
              selected={element}
              options={ElementNames.map((element) => ({
                value: element,
                label: element,
              }))}
              onChange={setElement}
            />
          </div> */}
          {/* Effect */}
          <div>
            <Select onValueChange={(e) => setEffect(e as EffectType)}>
              <Label htmlFor="rank">Effect</Label>
              <SelectTrigger>
                <SelectValue placeholder={effect} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-effect"} value={"ANY"}>
                  ANY
                </SelectItem>
                {effectFilters.map((ef) => (
                  <SelectItem key={ef} value={ef}>
                    {ef}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Item Type */}
          <div>
            <Select onValueChange={(e) => setItemType(e as ItemType)}>
              <Label htmlFor="rank">Item Type</Label>
              <SelectTrigger>
                <SelectValue placeholder={itemType} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-type"} value={"ANY"}>
                  ANY
                </SelectItem>
                {ItemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Ratity */}
          <div>
            <Select onValueChange={(e) => setRarity(e as ItemRarity)}>
              <Label htmlFor="rank">Rarity</Label>
              <SelectTrigger>
                <SelectValue placeholder={itemRarity} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-rarirty"} value="ANY">
                  ANY
                </SelectItem>
                {ItemRarities.map((ir) => (
                  <SelectItem key={ir} value={ir}>
                    {ir}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Slot */}
          <div>
            <Select onValueChange={(e) => setSlot(e as ItemSlotType)}>
              <Label htmlFor="rank">Slot</Label>
              <SelectTrigger>
                <SelectValue placeholder={slot} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-slot"} value="ANY">
                  ANY
                </SelectItem>
                {ItemSlotTypes.map((ir) => (
                  <SelectItem key={ir} value={ir}>
                    {ir}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Target */}
          <div>
            <Select onValueChange={(e) => setTarget(e as AttackTarget)}>
              <Label htmlFor="rank">Target</Label>
              <SelectTrigger>
                <SelectValue placeholder={target} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-target"} value="ANY">
                  ANY
                </SelectItem>
                {AttackTargets.map((ir) => (
                  <SelectItem key={ir} value={ir}>
                    {ir}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Method */}
          <div>
            <Select onValueChange={(e) => setMethod(e as AttackMethod)}>
              <Label htmlFor="rank">Method</Label>
              <SelectTrigger>
                <SelectValue placeholder={method} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"Any-method"} value="ANY">
                  ANY
                </SelectItem>
                {AttackMethods.map((ir) => (
                  <SelectItem key={ir} value={ir}>
                    {ir}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Event Item */}
          <div className="mt-1">
            <Toggle
              verticalLayout
              id="toggle-event-only"
              value={eventItems}
              setShowActive={setEventItems}
              labelActive="Event"
              labelInactive="Non-Event"
            />
          </div>
          {/* Shop Item */}
          <div className="mt-1">
            <Toggle
              verticalLayout
              id="toggle-in-shop"
              value={onlyInShop}
              setShowActive={setOnlyInShop}
              labelActive="In Shop"
              labelInactive="Not in Shop"
            />
          </div>
          {/* Hidden */}
          {userData && canSeeSecretData(userData.role) && (
            <div className="mt-1">
              <Toggle
                verticalLayout
                id="toggle-hidden-only"
                value={hidden}
                setShowActive={setHidden}
                labelActive="Hidden"
                labelInactive="Non-Hidden"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ItemFiltering;

/** tRPC filter to be used on api.item.getAll */
export const getFilter = (state: ItemFilteringState) => {
  return {
    name: state.name ? state.name : undefined,
    itemRarity: state.itemRarity !== "ANY" ? state.itemRarity : undefined,
    itemType: state.itemType !== "ANY" ? state.itemType : undefined,
    slot: state.slot !== "ANY" ? state.slot : undefined,
    target: state.target !== "ANY" ? state.target : undefined,
    method: state.method !== "ANY" ? state.method : undefined,
    eventItems: state.eventItems ? state.eventItems : false,
    onlyInShop: state.onlyInShop ? state.onlyInShop : false,
    effect: state.effect !== "ANY" ? state.effect : undefined,
    hidden: state.hidden ? state.hidden : undefined,
  };
};

/** State for the item Filtering component */
export const useFiltering = () => {
  // State variables
  const [name, setName] = useState<string>("");
  const [itemRarity, setRarity] = useState<(typeof ItemRarities)[number] | "ANY">(
    "ANY",
  );
  const [itemType, setItemType] = useState<(typeof ItemTypes)[number] | "ANY">("ANY");
  const [effect, setEffect] = useState<(typeof effectFilters)[number] | "ANY">("ANY");
  const [slot, setSlot] = useState<(typeof ItemSlotTypes)[number] | "ANY">("ANY");
  const [target, setTarget] = useState<(typeof AttackTargets)[number] | "ANY">("ANY");
  const [method, setMethod] = useState<(typeof AttackMethods)[number] | "ANY">("ANY");
  const [eventItems, setEventItems] = useState<boolean | undefined>(false);
  const [onlyInShop, setOnlyInShop] = useState<boolean | undefined>(true);
  const [hidden, setHidden] = useState<boolean | undefined>(false);

  // Return all
  return {
    effect,
    eventItems,
    hidden,
    itemRarity,
    itemType,
    method,
    name,
    onlyInShop,
    setEffect,
    setEventItems,
    setHidden,
    setItemType,
    setMethod,
    setName,
    setOnlyInShop,
    setRarity,
    setSlot,
    setTarget,
    slot,
    target,
  };
};

/** State type */
export type ItemFilteringState = ReturnType<typeof useFiltering>;
