"use client";

import type { PetSpecies } from "@/drizzle/schema";
import { EditContent } from "@/layout/EditContent";
import Modal from "@/layout/Modal";
import { usePetSpeciesEditForm } from "@/libs/petSpecies";
import { PetSpeciesValidator } from "@/validators/petSpecies";

/** Species define future offers and image prompts; every pet keeps its own artwork. */
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
      className="sm:max-w-2xl"
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
  const { form, formData, handleSubmit, isActive, isSaving, message } = editor;
  return (
    <>
      <p className="mb-4 text-muted-foreground text-sm">
        Describe the animal&apos;s defining appearance for AI-generated pet portraits.
        Players choose their own palette, characteristic and aura. Rarity affects daily
        availability, not combat strength.
      </p>
      <EditContent
        schema={PetSpeciesValidator}
        form={form}
        formData={formData}
        showSubmit
        buttonTxt={isNew ? "Create species" : "Save to Database"}
        submitDisabled={!isNew && !form.formState.isDirty}
        onAccept={handleSubmit}
        submitLoading={isSaving}
        submitLoadingText="Saving"
      >
        <p className="col-span-full text-muted-foreground text-sm">
          {isActive
            ? "This species can appear in new daily offers."
            : "This species is retired from new daily offers."}{" "}
          Existing companions keep their species and generated portraits.
        </p>
        {message && (
          <p role="alert" className="col-span-full text-destructive text-sm">
            {message}
          </p>
        )}
      </EditContent>
    </>
  );
};
