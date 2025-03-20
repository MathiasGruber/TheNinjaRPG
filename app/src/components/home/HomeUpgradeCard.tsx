import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/app/_trpc/client";
import { HomeUpgrades } from "@/drizzle/constants";
import { showMutationToast } from "@/libs/toast";

export function HomeUpgradeCard() {
  const { data: homeInfo, refetch } = api.home.getHomeInfo.useQuery();
  const upgradeMutation = api.home.upgradeHome.useMutation({
    onSuccess: (data) => {
      showMutationToast({
        success: data.success,
        message: data.message,
      });
      if (data.success) {
        void refetch();
      }
    },
  });
  const downgradeMutation = api.home.downgradeHome.useMutation({
    onSuccess: (data) => {
      showMutationToast({
        success: data.success,
        message: data.message,
      });
      if (data.success) {
        void refetch();
      }
    },
  });

  if (!homeInfo) return null;

  const { currentHome, availableUpgrades, availableDowngrades, money, currentStorage, maxStorage } = homeInfo;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Home</CardTitle>
        <CardDescription>
          Your current home: {currentHome.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Regeneration</p>
            <p className="text-2xl font-bold">+{currentHome.regen}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Storage</p>
            <p className="text-2xl font-bold">
              {currentStorage}/{maxStorage}
            </p>
          </div>
        </div>

        {availableUpgrades.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Available Upgrades</h3>
            <div className="grid gap-2">
              {availableUpgrades.map(([type, home]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div>
                    <p className="font-medium">{home.name}</p>
                    <p className="text-sm text-muted-foreground">
                      +{home.regen} Regen, {home.storage} Storage
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => upgradeMutation.mutate({ newHomeType: type })}
                    disabled={money < home.cost}
                  >
                    {home.cost.toLocaleString()} Ryo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {availableDowngrades.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Available Downgrades</h3>
            <div className="grid gap-2">
              {availableDowngrades.map(([type, home]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div>
                    <p className="font-medium">{home.name}</p>
                    <p className="text-sm text-muted-foreground">
                      +{home.regen} Regen, {home.storage} Storage
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => downgradeMutation.mutate({ newHomeType: type })}
                  >
                    Refund: {Math.floor((currentHome.cost - home.cost) * 0.5).toLocaleString()} Ryo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 