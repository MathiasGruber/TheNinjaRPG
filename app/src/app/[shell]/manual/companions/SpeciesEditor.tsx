"use client";

import { FilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PET_ABILITY_SLOTS_BY_RARITY } from "@/drizzle/constants";
import type { PetSpecies } from "@/drizzle/schema";
import AiProfileEdit from "@/layout/AiProfileEdit";
import { EditContent, EffectFormWrapper } from "@/layout/EditContent";
import Modal from "@/layout/Modal";
import { usePetSpeciesEditForm } from "@/libs/petSpecies";
import { isPetPassiveEffectAllowed } from "@/libs/pets/abilities";
import {
  getTagSchema,
  IncreaseStatTag,
  tagTypes,
  type ZodAllTags,
} from "@/validators/combat";
import { PetSpeciesValidator, type ZodPetSpeciesType } from "@/validators/petSpecies";
import { PET_AI_ACTION_TYPES, PET_AI_EFFECT_TYPES } from "@/validators/pets";

/** Species provide authored defaults; every owned companion retains its own appearance and choices. */
export const SpeciesEditor = ({
  species,
  onSaved,
}: {
  species?: PetSpecies;
  onSaved: () => void | Promise<void>;
}) => {
  const editor = usePetSpeciesEditForm(species, onSaved);
  return <SpeciesForm editor={editor} isNew={!species} />;
};

/** Keep a pending creation open so a rejection returns to the same editable draft. */
export const CreateSpeciesModal = ({
  setIsOpen,
}: {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const editor = usePetSpeciesEditForm(undefined, () => setIsOpen(false));
  return (
    <Modal
      title="New companion species"
      isOpen
      setIsOpen={setIsOpen}
      isLoading={editor.isSaving}
      className="sm:max-w-4xl"
    >
      <SpeciesForm editor={editor} isNew />
    </Modal>
  );
};

const SpeciesForm = ({
  editor,
  isNew,
}: {
  editor: ReturnType<typeof usePetSpeciesEditForm>;
  isNew: boolean;
}) => {
  const [tab, setTab] = useState("general");
  const { form, formData, handleSubmit, isActive, isSaving, message, effects } = editor;
  const validEffects = effects.filter(
    (effect): effect is ZodAllTags => effect !== undefined,
  );
  const setEffects = (values: ZodAllTags[]) =>
    form.setValue("effects", values, { shouldDirty: true });
  const contentForm = form as unknown as UseFormReturn<ZodPetSpeciesType>;
  return (
    <fieldset disabled={isSaving} className="min-w-0">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 grid grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="loadout">Loadout</TabsTrigger>
          <TabsTrigger value="skills">Pet skills</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>
        <TabsContent value="general" forceMount hidden={tab !== "general"}>
          <p className="mb-4 text-muted-foreground text-sm">
            Describe the animal&apos;s appearance for its generated portrait. Rarity
            affects daily availability and jutsu slots. Role describes its playstyle;
            authored jutsu and AI instructions determine its behavior.
          </p>
          <EditContent
            schema={PetSpeciesValidator}
            form={contentForm}
            formData={formData}
            showSubmit={false}
            onAccept={handleSubmit}
            submitLoading={isSaving}
          >
            <p className="col-span-full text-muted-foreground text-sm">
              {isActive
                ? "This species can appear in new daily offers."
                : "This species is retired from new daily offers."}{" "}
              Existing companions keep their species and generated portraits.
            </p>
          </EditContent>
        </TabsContent>
        <TabsContent value="loadout" forceMount hidden={tab !== "loadout"}>
          <p className="mb-4 text-muted-foreground text-sm">
            This rarity has {PET_ABILITY_SLOTS_BY_RARITY[editor.rarity]} jutsu slots.
            Defaults are copied to newly acquired companions and remain editable by
            their owners. Rank, level and power limits still apply.
          </p>
          {editor.catalogue.isError && (
            <p role="alert">
              Could not load pet jutsu.{" "}
              <Button variant="link" onClick={() => void editor.catalogue.refetch()}>
                Try again
              </Button>
            </p>
          )}
          <EditContent
            schema={PetSpeciesValidator}
            form={contentForm}
            formData={editor.loadoutFormData}
            showSubmit={false}
            onAccept={handleSubmit}
            submitLoading={isSaving || editor.catalogue.isPending}
          />
          {editor.catalogue.hasNextPage && (
            <Button
              variant="outline"
              disabled={editor.catalogue.isFetchingNextPage}
              onClick={() => void editor.catalogue.fetchNextPage()}
            >
              Load more pet jutsu
            </Button>
          )}
        </TabsContent>
        <TabsContent value="skills" forceMount hidden={tab !== "skills"}>
          <p className="mb-4 text-muted-foreground text-sm">
            Self skills apply to the participating companion and its owner. Enemy skills
            trigger when either reaches an opponent with an accepted action. These
            bonuses apply only while the companion participates in an eligible battle.
          </p>
          <EditContent
            schema={PetSpeciesValidator}
            form={contentForm}
            formData={editor.skillFormData}
            showSubmit={false}
            onAccept={handleSubmit}
            submitLoading={isSaving}
          />
          <Button
            variant="outline"
            onClick={() => setEffects([...validEffects, IncreaseStatTag.parse({})])}
          >
            <FilePlus className="mr-2 h-4 w-4" />
            Add pet skill tag
          </Button>
          <div className="mt-3 space-y-3">
            {validEffects.map((effect, index) => (
              <div key={`${effect.type}-${index}`} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <strong>Pet skill tag {index + 1}</strong>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove pet skill tag ${index + 1}`}
                    onClick={() =>
                      setEffects(validEffects.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <EffectFormWrapper
                  idx={index}
                  type="skillTree"
                  tag={effect}
                  effects={validEffects}
                  setEffects={setEffects}
                  availableTags={petSkillTags}
                  submitLoading={isSaving}
                />
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="ai" forceMount hidden={tab !== "ai"}>
          <p className="mb-4 text-muted-foreground text-sm">
            Save the species profile to set the instructions copied to new companions.
            Existing owners keep their own instructions.
          </p>
          <AiProfileEdit
            userData={{
              userId: "species-default",
              aiProfileId: null,
              jutsus: [],
              items: [],
            }}
            availableActionTypes={PET_AI_ACTION_TYPES}
            availableActionEffects={PET_AI_EFFECT_TYPES}
            configuration={{
              profile: editor.aiProfile,
              isSaving,
              onSave: (profile) => {
                form.setValue("aiRules", profile.rules, { shouldDirty: true });
                form.setValue("includeDefaultRules", profile.includeDefaultRules, {
                  shouldDirty: true,
                });
                void handleSubmit();
              },
            }}
          />
        </TabsContent>
      </Tabs>
      {message && (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {message}
        </p>
      )}
      {tab !== "ai" && (
        <Button
          className="mt-4"
          disabled={isSaving || (!isNew && !form.formState.isDirty)}
          onClick={() => void handleSubmit()}
        >
          {isSaving ? "Saving" : isNew ? "Create species" : "Save to Database"}
        </Button>
      )}
    </fieldset>
  );
};

/** The editor offers exactly the self-contained effects accepted by battle initiation. */
const petSkillTags = tagTypes.filter((type) => {
  const parsed = getTagSchema(type as ZodAllTags["type"]).safeParse({});
  return parsed.success && isPetPassiveEffectAllowed(parsed.data);
});
