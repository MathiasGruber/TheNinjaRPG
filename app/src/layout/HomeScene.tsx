"use client";

import { BedDouble, ChefHat, House, Package, Sprout } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type HomeType, HomeTypeDetails } from "@/drizzle/constants";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import { cn } from "@/libs/shadui";

/**
 * Residence navigation through labeled scene objects and equivalent text controls.
 * The home page owns sleep mutations, dialog state, and their user feedback.
 */
export const HomeScene = ({
  homeType,
  isGuest,
  isAsleep,
  isTogglingSleep,
  onSleep,
  onStorage,
  onManage,
}: HomeSceneProps) => {
  // A new tier can load its artwork without remounting the controls used as dialog focus targets.
  const [failedHomeType, setFailedHomeType] = useState<HomeType | null>(null);
  const hasImageError = failedHomeType === homeType;
  const sleepLabel = isTogglingSleep
    ? "Please wait…"
    : isAsleep
      ? "Wake up"
      : "Go to sleep";
  const hotspotClassName =
    "absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 rounded-lg border border-amber-200/70 bg-slate-950/85 px-2 py-2 text-white text-xs shadow-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 sm:text-sm";

  return (
    <div className="space-y-3">
      <fieldset
        aria-label="Home scene"
        className="relative mx-auto aspect-square w-full max-w-2xl overflow-hidden rounded-xl border bg-muted"
      >
        {!hasImageError && (
          <Image
            src={HOME_SCENE_IMAGES[homeType]}
            alt={`${isGuest ? "Guest residence" : HomeTypeDetails[homeType].name} with a bed, armory, kitchen and garden`}
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-contain"
            preload
            onError={() => setFailedHomeType(homeType)}
          />
        )}
        {hasImageError && (
          <p role="status" className="absolute inset-x-4 top-4 text-center text-sm">
            Home artwork is unavailable. You can still use all the controls below.
          </p>
        )}
        <button
          type="button"
          aria-label={`Bed: ${sleepLabel}`}
          aria-busy={isTogglingSleep}
          disabled={isTogglingSleep}
          onClick={onSleep}
          className={cn(hotspotClassName, "disabled:cursor-wait disabled:opacity-60")}
          style={{ left: "34%", top: "26%" }}
        >
          <BedDouble className="h-4 w-4" aria-hidden /> Bed
        </button>
        <button
          type="button"
          aria-label={
            isGuest
              ? "Armory: Home storage is in your own village"
              : "Armory: Open home storage"
          }
          disabled={isGuest}
          onClick={(event) => onStorage(event.currentTarget)}
          className={cn(
            hotspotClassName,
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          style={{ left: "18%", top: "59%" }}
        >
          <Package className="h-4 w-4" aria-hidden /> Armory
        </button>
        <Link
          href="/ramenshop"
          aria-label="Kitchen: Visit ramen shop"
          className={hotspotClassName}
          style={{ left: "73%", top: "57%" }}
        >
          <ChefHat className="h-4 w-4" aria-hidden /> Kitchen
        </Link>
        <Link
          href="/farm"
          aria-label="Garden: Visit farm"
          className={hotspotClassName}
          style={{ left: "80%", top: "87%" }}
        >
          <Sprout className="h-4 w-4" aria-hidden /> Garden
        </Link>
      </fieldset>
      <p role="status" aria-live="polite" className="text-center text-sm">
        {isTogglingSleep
          ? "Changing sleep status…"
          : isAsleep
            ? "You are asleep. Resting restores your energy."
            : "You are awake."}
      </p>
      <fieldset
        aria-label="Home actions"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <Button
          variant="outline"
          onClick={onSleep}
          disabled={isTogglingSleep}
          className="min-h-11"
        >
          <BedDouble className="mr-2 h-4 w-4" aria-hidden /> {sleepLabel}
        </Button>
        <Button
          variant="outline"
          onClick={(event) => onStorage(event.currentTarget)}
          disabled={isGuest}
          className="min-h-11"
        >
          <Package className="mr-2 h-4 w-4" aria-hidden /> Home storage
        </Button>
        <Button variant="outline" asChild className="min-h-11">
          <Link href="/ramenshop">
            <ChefHat className="mr-2 h-4 w-4" aria-hidden /> Kitchen
          </Link>
        </Button>
        <Button variant="outline" asChild className="min-h-11">
          <Link href="/farm">
            <Sprout className="mr-2 h-4 w-4" aria-hidden /> Farm
          </Link>
        </Button>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
        <span>Kitchen serves ramen while cooking is being prepared.</span>
        {!isGuest && (
          <Button
            variant="outline"
            onClick={(event) => onManage(event.currentTarget)}
            className="min-h-11"
          >
            <House className="mr-2 h-4 w-4" aria-hidden /> Manage home
          </Button>
        )}
      </div>
    </div>
  );
};

/** Square tier artwork sharing the same relative bed, armory, kitchen, and garden positions. */
export const HOME_SCENE_IMAGES = {
  NONE: "/images/home/tent.webp",
  STUDIO_APARTMENT: "/images/home/studio-apartment.webp",
  ONE_BED_APARTMENT: "/images/home/one-bed-apartment.webp",
  TWO_BED_HOUSE: "/images/home/two-bed-house.webp",
  TOWN_HOUSE: "/images/home/town-house.webp",
  SMALL_MANSION: "/images/home/small-mansion.webp",
  SMALL_ESTATE: "/images/home/small-estate.webp",
  LARGE_ESTATE: "/images/home/large-estate.webp",
  PALACE: "/images/home/palace.webp",
  MARSHMALLOWOPOLIS: "/images/home/marshmallowopolis.webp",
} satisfies Record<HomeType, string>;

/** Residence state and actions supplied by the home page's existing tRPC flows. */
type HomeSceneProps = {
  homeType: HomeType;
  /** Guests retain navigation and sleep controls while owner-only panels stay unavailable. */
  isGuest: boolean;
  isAsleep: boolean;
  isTogglingSleep: boolean;
  onSleep: () => void;
  /** Open storage and retain the invoking control as the dialog's focus-return target. */
  onStorage: (trigger: HTMLButtonElement) => void;
  /** Open home management and retain its invoking control for focus restoration. */
  onManage: (trigger: HTMLButtonElement) => void;
};
