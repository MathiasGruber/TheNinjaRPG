"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

export function PvpRankLoadout() {
  const router = useRouter();
  const [selectedJutsu, setSelectedJutsu] = useState<string[]>([]);
  const [selectedWeapons, setSelectedWeapons] = useState<string[]>([]);
  const [selectedConsumables, setSelectedConsumables] = useState<string[]>([]);

  const { data: loadout } = api.pvpRank.getLoadout.useQuery();

  const { mutate: saveLoadout } = api.pvpRank.saveLoadout.useMutation();
  const { mutate: enterQueue } = api.pvpRank.enterQueue.useMutation({
    onSuccess: () => {
      router.refresh();
    },
  });

  const handleSaveAndQueue = () => {
    if (selectedJutsu.length > 15 || selectedWeapons.length > 2 || selectedConsumables.length > 4) {
      return;
    }

    saveLoadout({
      jutsu: selectedJutsu,
      weapons: selectedWeapons,
      consumables: selectedConsumables,
    }, {
      onSuccess: () => {
        enterQueue();
      },
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">Create Your Loadout</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <h3 className="font-semibold mb-2">Jutsu ({selectedJutsu.length}/15)</h3>
          {/* TODO: Add jutsu selection UI */}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Weapons ({selectedWeapons.length}/2)</h3>
          {/* TODO: Add weapons selection UI */}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Consumables ({selectedConsumables.length}/4)</h3>
          {/* TODO: Add consumables selection UI */}
        </div>
      </div>

      <button
        onClick={handleSaveAndQueue}
        disabled={
          selectedJutsu.length === 0 ||
          selectedJutsu.length > 15 ||
          selectedWeapons.length > 2 ||
          selectedConsumables.length > 4
        }
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
      >
        Save Loadout & Enter Queue
      </button>
    </div>
  );
}
