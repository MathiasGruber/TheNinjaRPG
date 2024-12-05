"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { useRouter } from "next/navigation";
import { api } from "@/app/_trpc/client";
import { useEffect, use } from "react";
import { EditContent } from "@/layout/EditContent";
import { useRequiredUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { useAssetEditForm } from "@/libs/asset";
import { gameAssetValidator } from "@/validators/asset";
import type { GameAsset } from "@/drizzle/schema";

export default function AssetEdit(props: { params: Promise<{ assetid: string }> }) {
  const params = use(props.params);
  const assetId = params.assetid;
  const router = useRouter();
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isPending, refetch } = api.gameAsset.get.useQuery(
    { id: assetId },
    { enabled: assetId !== undefined },
  );

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isPending || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditAsset asset={data} refetch={refetch} />;
}

interface SingleEditAssetProps {
  asset: GameAsset;
  refetch: () => void;
}

const SingleEditAsset: React.FC<SingleEditAssetProps> = (props) => {
  // Form handling
  const { asset, form, formData, handleAssetSubmit } = useAssetEditForm(
    props.asset,
    props.refetch,
  );

  // Show panel controls
  return (
    <ContentBox
      title="Content Panel"
      subtitle="Asset Management"
      back_href="/manual/asset"
      noRightAlign={true}
    >
      {!asset && <p>Could not find this asset</p>}
      {asset && (
        <EditContent
          schema={gameAssetValidator}
          form={form}
          formData={formData}
          showSubmit={form.formState.isDirty}
          buttonTxt="Save to Database"
          type="asset"
          allowImageUpload={true}
          onAccept={handleAssetSubmit}
        />
      )}
    </ContentBox>
  );
};
