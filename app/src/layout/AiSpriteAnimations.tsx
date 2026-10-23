"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import ContentBox from "@/layout/ContentBox";
import type { CharacterAnimation } from "@/libs/spriteAnimations";
import { showMutationToast } from "@/libs/toast";
import { UploadButton } from "@/utils/uploadthing";
import {
  type SpriteAnimationInput,
  spriteAnimationSchema,
} from "@/validators/spriteAnimation";

export const AiSpriteAnimations = ({ userId }: { userId: string }) => {
  const utils = api.useUtils();
  const config = api.spriteAnimation.getAiConfig.useQuery({ userId });
  const [previewKey, setPreviewKey] = useState("idle");
  const form = useForm<SpriteAnimationInput>({
    resolver: zodResolver(spriteAnimationSchema),
    defaultValues: {
      name: "",
      url: "",
      columns: 6,
      rows: 4,
      frameCount: 24,
      fps: 12.5,
      facing: "left",
    },
  });
  const { errors } = useFormState({ control: form.control });
  const create = api.spriteAnimation.create.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success) {
        form.reset();
        await utils.spriteAnimation.getAiConfig.invalidate();
      }
    },
  });
  const assign = api.spriteAnimation.assign.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success)
        await utils.spriteAnimation.getAiConfig.invalidate({ userId });
    },
  });
  const data = config.data;
  const bindings = new Map(
    data?.assignments.map((assignment) => [
      assignment.actionKey,
      assignment.animationId,
    ]),
  );
  const animationId = bindings.get(previewKey) ?? bindings.get("idle");
  const preview = data?.animations.find((animation) => animation.id === animationId);

  return (
    <ContentBox
      title="Sprite animations"
      subtitle="Idle, movement and action-specific character sprites"
      initialBreak
    >
      <p className="mb-3 text-sm">
        Unassigned actions use Idle. If Idle is unassigned, the current character image
        is shown. Changes take effect in new battles.
      </p>
      {config.isPending && <p>Loading animation assignments…</p>}
      {config.error && (
        <div role="alert">
          <p>{config.error.message}</p>
          <Button onClick={() => void config.refetch()}>Retry</Button>
        </div>
      )}
      {data && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            {data.actions.map((action) => (
              <div
                key={action.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
              >
                <Label htmlFor={`animation-${action.key}`}>
                  <span className="text-muted-foreground text-xs">
                    {action.group} ·{" "}
                  </span>
                  {action.name}
                </Label>
                <select
                  id={`animation-${action.key}`}
                  className="min-w-0 rounded-md border bg-background p-2 text-sm"
                  value={bindings.get(action.key) ?? ""}
                  disabled={assign.isPending}
                  onChange={(event) => {
                    setPreviewKey(action.key);
                    assign.mutate({
                      userId,
                      actionKey: action.key,
                      animationId: event.target.value || null,
                    });
                  }}
                  onFocus={() => setPreviewKey(action.key)}
                >
                  <option value="">
                    {action.key === "idle" ? "Current image" : "Default (idle → image)"}
                  </option>
                  {data.animations.map((animation) => (
                    <option key={animation.id} value={animation.id}>
                      {animation.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {assign.error && (
              <p role="alert" className="text-destructive text-sm">
                {assign.error.message}
              </p>
            )}
          </div>
          <div>
            <p className="mb-2 font-semibold text-sm">
              Preview · {data.actions.find((action) => action.key === previewKey)?.name}
            </p>
            {preview ? (
              <SpriteAnimationPreview key={preview.id} animation={preview} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Uses the current character image.
              </p>
            )}
            {preview && (
              <p className="mt-2 text-muted-foreground text-xs">
                {preview.frameCount} frames · {preview.fps} fps · faces {preview.facing}
              </p>
            )}
          </div>
        </div>
      )}
      <details className="mt-5 rounded-md border p-3">
        <summary className="cursor-pointer font-semibold text-sm">
          Add a sprite animation
        </summary>
        <p className="my-3 text-muted-foreground text-sm">
          Upload a transparent PNG sprite sheet with equal square cells, read left to
          right, then top to bottom. New sheets are kept in the library when assignments
          change.
        </p>
        <form
          onSubmit={form.handleSubmit((values) =>
            create.mutate(spriteAnimationSchema.parse(values)),
          )}
          className="space-y-3"
        >
          {(
            [
              ["name", "Name"],
              ["url", "Sprite sheet URL"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <Label htmlFor={`sprite-${field}`}>{label}</Label>
              <Input id={`sprite-${field}`} {...form.register(field)} />
              {errors[field] && (
                <p role="alert" className="text-destructive text-xs">
                  {errors[field]?.message}
                </p>
              )}
            </div>
          ))}
          <UploadButton
            endpoint="spriteAnimationUploader"
            onClientUploadComplete={(files) => {
              const result = files?.[0]?.serverData;
              if (result?.error)
                showMutationToast({ success: false, message: result.error });
              else if (result?.fileUrl)
                form.setValue("url", result.fileUrl, { shouldValidate: true });
            }}
            onUploadError={(error) =>
              showMutationToast({ success: false, message: error.message })
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["columns", "Columns"],
                ["rows", "Rows"],
                ["frameCount", "Frames"],
                ["fps", "Frames / second"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`sprite-${field}`}>{label}</Label>
                <NumberInput
                  id={`sprite-${field}`}
                  step={field === "fps" ? "0.1" : "1"}
                  {...form.register(field)}
                />
                {errors[field] && (
                  <p role="alert" className="text-destructive text-xs">
                    {errors[field]?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
          <Label htmlFor="sprite-facing">Source facing</Label>
          <select
            id="sprite-facing"
            className="ml-3 rounded-md border bg-background p-2 text-sm"
            {...form.register("facing")}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          {create.error && (
            <p role="alert" className="text-destructive text-sm">
              {create.error.message}
            </p>
          )}
          <div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Add to animation library"}
            </Button>
          </div>
        </form>
      </details>
    </ContentBox>
  );
};

export const SpriteAnimationPreview = ({
  animation,
}: {
  animation: CharacterAnimation;
}) => {
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % animation.frameCount),
      1000 / animation.fps,
    );
    return () => window.clearInterval(timer);
  }, [animation.frameCount, animation.fps]);
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-md border bg-muted"
      role="img"
      aria-label={animation.name}
    >
      {error ? (
        <p role="alert" className="p-3 text-sm">
          Sprite sheet could not be loaded. Check the image URL.
        </p>
      ) : (
        // biome-ignore lint/performance/noImgElement: Atlas UV previews must load the full unchanged sheet.
        <img
          src={animation.url}
          alt=""
          onError={() => setError(true)}
          className="absolute max-w-none"
          style={{
            width: `${animation.columns * 100}%`,
            height: `${animation.rows * 100}%`,
            left: `${-(frame % animation.columns) * 100}%`,
            top: `${-Math.floor(frame / animation.columns) * 100}%`,
            imageRendering: "pixelated",
          }}
        />
      )}
    </div>
  );
};
