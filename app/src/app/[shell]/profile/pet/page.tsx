import { redirect } from "next/navigation";

/** Route direct companion links into the profile's pet tab while preserving the selected pet. */
export default async function PetProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ petId?: string | string[] }>;
}) {
  const { petId } = await searchParams;
  const selectedPetId = Array.isArray(petId) ? petId[0] : petId;
  const query = new URLSearchParams({ tab: "pet" });
  if (selectedPetId) query.set("petId", selectedPetId);
  redirect(`/profile?${query.toString()}`);
}
