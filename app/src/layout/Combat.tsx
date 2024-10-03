import React, { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Vector2, OrthographicCamera, Group, Clock } from "three";
import Countdown from "./Countdown";
import WebGlError from "@/layout/WebGLError";
import { Button } from "@/components/ui/button";
import { HelpCircle, Clock as ClockIcon, CheckCircle } from "lucide-react";
import { drawCombatBackground, drawCombatEffects } from "@/libs/combat/drawing";
import { OrbitControls } from "@/libs/threejs/OrbitControls";
import { COMBAT_SECONDS, COMBAT_LOBBY_SECONDS } from "@/libs/combat/constants";
import { SpriteMixer } from "@/libs/threejs/SpriteMixer";
import { cleanUp, setupScene } from "@/libs/travel/util";
import { highlightTiles } from "@/libs/combat/drawing";
import { highlightTooltips } from "@/libs/combat/drawing";
import { highlightUsers } from "@/libs/combat/drawing";
import { calcActiveUser } from "@/libs/combat/actions";
import { drawCombatUsers } from "@/libs/combat/drawing";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { secondsFromNow } from "@/utils/time";
import { showMutationToast } from "@/libs/toast";
import { useSetAtom } from "jotai";
import { userBattleAtom } from "@/utils/UserContext";
import { Check } from "lucide-react";
import { PvpBattleTypes } from "@/drizzle/constants";
import type { Grid } from "honeycomb-grid";
import type { ReturnedBattle, StatSchemaType } from "@/libs/combat/types";
import type { CombatAction } from "@/libs/combat/types";
import type { BattleState } from "@/libs/combat/types";
import type { TerrainHex } from "@/libs/hexgrid";
import { useLocalStorage } from "@/hooks/localstorage";

interface CombatProps {
  action?: CombatAction | undefined;
  battleState: BattleState;
  userId: string;
  setBattleState: React.Dispatch<React.SetStateAction<BattleState | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  // Destructure props
  const { battleState, setBattleState } = props;
  const result = battleState.result;
  const utils = api.useUtils();

  // State
  const [isInLobby, setIsInLobby] = useState<boolean>(true);

  // References which shouldn't update
  const [webglError, setWebglError] = useState<boolean>(false);
  const [hasFocus, setHasFocus] = useState<boolean>(true);
  const lastActions = useRef<Date[]>([]);
  const battle = useRef<ReturnedBattle | null | undefined>(battleState.battle);
  const action = useRef<CombatAction | undefined>(props.action);
  const userId = useRef<string>(props.userId);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();
  const battleId = battle.current?.id;
  const battleType = battle.current?.battleType;

  // Data from the DB
  const setBattleAtom = useSetAtom(userBattleAtom);
  const { data: userData, pusher, timeDiff } = useRequiredUserData();
  const [statDistribution] = useLocalStorage<StatSchemaType | undefined>(
    "statDistribution",
    undefined,
  );
  const suid = userData?.userId;

  // Convenience method for helping people to not move too fast
  const canPerformAction = () => {
    const minuteAgo = secondsFromNow(-60);
    const newActions = lastActions.current.filter((a) => a > minuteAgo);
    newActions.push(new Date());
    if (newActions.length < 55) {
      lastActions.current = newActions;
      return true;
    } else {
      document.body.style.cursor = "default";
      showMutationToast({
        success: false,
        message: "You are acting very fast. Much faster and you will be penalized.",
      });
      return false;
    }
  };

  // Mutation for starting a fight
  const { mutate: battleArenaHealAndGo } = api.combat.battleArenaHeal.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        showMutationToast({
          success: data.success,
          message: "You enter the arena again",
        });
        startArenaBattle({
          aiId: arenaOpponentId!,
          stats:
            battle.current?.battleType === "TRAINING" ? statDistribution : undefined,
        });
      } else {
        showMutationToast(data);
      }
    },
  });

  // Mutation for starting a fight
  const { mutate: startArenaBattle } = api.combat.startArenaBattle.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        showMutationToast({
          success: data.success,
          message: "You enter the arena again",
        });
        setBattleAtom(undefined);
        setBattleState({ battle: undefined, result: null, isPending: true });
        await utils.combat.getBattle.invalidate();
        await utils.profile.getUser.invalidate();
      } else {
        showMutationToast(data);
      }
    },
  });

  // User Action
  const { mutate: performAction, isPending } = api.combat.performAction.useMutation({
    onMutate: () => {
      document.body.style.cursor = "wait";
      setBattleState({ battle: battle.current, result: null, isPending: true });
    },
    onSuccess: (data) => {
      // Notifications (if any)
      if (data.notification) {
        showMutationToast({ success: true, message: data.notification });
      }
      if (data?.result?.notifications.length !== 0) {
        data?.result?.notifications.forEach((notification) => {
          showMutationToast({
            success: true,
            title: "Quest Update",
            message: notification,
          });
        });
      }
      // Update battle history
      if (battleId && data.logEntries) {
        const prevData = utils.combat.getBattleEntries.getData({
          battleId,
          refreshKey: battle.current?.version,
        });
        utils.combat.getBattleEntries.setData(
          { battleId, refreshKey: data.battle.version },
          () => {
            if (data.logEntries) {
              return prevData ? [...data.logEntries, ...prevData] : data.logEntries;
            }
          },
        );
      }
      // Update battle state
      if (data.updateClient) {
        battle.current = data.battle;
        setBattleState({
          battle: data.battle,
          result: data.result,
          isPending: false,
        });
        setBattleAtom(battle.current);
      }
    },
  });

  // I am here call
  const { mutate: iAmHere } = api.combat.iAmHere.useMutation({
    onSuccess: (data) => {
      if (data.success && data.battle) {
        battle.current = data.battle;
        setBattleAtom(battle.current);
        setBattleState({ battle: data.battle, result: null, isPending: false });
      } else {
        showMutationToast({ success: false, message: data.message });
      }
    },
  });
  useEffect(() => {
    if (
      battle.current &&
      isInLobby &&
      PvpBattleTypes.includes(battle.current.battleType)
    ) {
      const user = battle.current.usersState.find((u) => u.userId === suid);
      if (user && !user.iAmHere) {
        iAmHere({ battleId: battle.current.id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInLobby]);

  // Handle key-presses
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (battle.current) {
      const { actor } = calcActiveUser(battle.current, suid, timeDiff);
      switch (event.key) {
        case "w":
          if (actor.userId === suid) {
            document.body.style.cursor = "wait";
            if (canPerformAction()) {
              performAction({
                battleId: battle.current.id,
                userId: userId.current,
                actionId: "wait",
                longitude: actor.longitude,
                latitude: actor.latitude,
                version: battle.current.version,
              });
            }
          }
          break;
      }
    }
  };
  useEffect(() => {
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update mouse position on mouse move
  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };
  const onDocumentMouseLeave = () => {
    if (mountRef.current) {
      mouse.x = 9999999;
      mouse.y = 9999999;
    }
  };

  // If user has no actions left / round is over, propagate battle & potentially - perform AI actions
  useEffect(() => {
    const interval = setInterval(() => {
      const focusCheck = document.hasFocus();
      if (!focusCheck) setHasFocus(false);
      if (!hasFocus || !focusCheck) return;
      if (suid && battle.current && userId.current && !isPending && !result) {
        const { actor, changedActor } = calcActiveUser(battle.current, suid, timeDiff);
        // Scenario 1: it is now AIs turn, perform action
        if (actor.isAi && !isPending) {
          if (canPerformAction()) {
            performAction({
              battleId: battle.current.id,
              version: battle.current.version,
            });
          }
        } else {
          // Scenario 2: more than 10 seconds passed, or actor is no longer the same as active user - refetch
          const updatePassed =
            Date.now() - timeDiff - battle.current.roundStartAt.getTime();
          const createPassed =
            Date.now() - timeDiff - battle.current.createdAt.getTime();
          const check1 = updatePassed > COMBAT_SECONDS * 1000;
          const check2 = createPassed > (COMBAT_LOBBY_SECONDS + COMBAT_SECONDS) * 1000;
          if ((check1 && check2) || changedActor) {
            battle.current.roundStartAt = new Date();
            void utils.combat.getBattle.invalidate();
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, timeDiff, result, suid]);

  useEffect(() => {
    action.current = props.action;
    userId.current = props.userId;
    battle.current = props.battleState.battle;
    if (props.battleState.result) {
      const update = async () => {
        await utils.profile.getUser.invalidate();
      };
      update().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  useEffect(() => {
    if (battleId && pusher) {
      const channel = pusher.subscribe(battleId);
      channel.bind("event", (data: { version: number }) => {
        if (battle.current?.version !== data.version && !result) {
          void utils.combat.getBattle.invalidate();
        }
      });
      return () => {
        pusher.unsubscribe(battleId);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  // Lobby for non-arena battles, letting both oppoenents join
  useEffect(() => {
    if (isInLobby) {
      const interval = setInterval(() => {
        const syncedTime = Date.now() - timeDiff;
        if (battle.current && battle.current.createdAt.getTime() > syncedTime) {
          setIsInLobby(true);
        } else {
          setIsInLobby(false);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [battle, timeDiff, isInLobby]);

  useEffect(() => {
    // Reference to the mount
    const sceneRef = mountRef.current;

    if (sceneRef && battle.current) {
      // Used for map size calculations
      const backgroundLengthToWidth = 576 / 1024;

      // Map size
      const WIDTH = sceneRef.getBoundingClientRect().width;
      const HEIGHT = WIDTH * backgroundLengthToWidth;

      // Listeners
      sceneRef.addEventListener("mousemove", onDocumentMouseMove, false);
      sceneRef.addEventListener("mouseleave", onDocumentMouseLeave, false);

      // Setup scene, renderer and raycaster
      const { scene, renderer, raycaster, handleResize } = setupScene({
        mountRef: mountRef,
        width: WIDTH,
        height: HEIGHT,
        sortObjects: false,
        color: 0x000000,
        colorAlpha: 1,
        width2height: backgroundLengthToWidth,
      });

      // If no renderer, then we have an error with the browser, let the user know
      if (!renderer) {
        setWebglError(true);
        return;
      }

      // Create scene
      sceneRef.appendChild(renderer.domElement);

      // Setup camara
      const camera = new OrthographicCamera(0, WIDTH, HEIGHT, 0, -10, 10);
      camera.zoom = 1.5;
      camera.updateProjectionMatrix();

      // Draw the background
      const { group_tiles, group_edges, honeycombGrid } = drawCombatBackground(
        WIDTH,
        HEIGHT,
        scene,
        battle.current.background,
      );
      grid.current = honeycombGrid;

      // Intersections & highlights from interactions
      let highlights = new Set<string>();
      let tooltips = new Set<string>();
      let userHighlights = new Set<string>();
      // let currentTooltips = new Set<string>();

      // js groups for organization
      const group_users = new Group();
      const group_ground = new Group();

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 0.3;
      controls.minZoom = 1;
      controls.maxZoom = 3;

      // Add the group to the scene
      scene.add(group_tiles);
      scene.add(group_edges);
      scene.add(group_ground);
      scene.add(group_users);

      // Capture clicks to update move direction
      const onClick = () => {
        const intersects = raycaster.intersectObjects(scene.children);
        intersects
          .filter((i) => i.object.visible)
          .every((i) => {
            if (
              i.object.userData.type === "tile" &&
              document.body.style.cursor !== "wait"
            ) {
              if (
                i.object.userData.canClick === true &&
                action.current &&
                battle.current
              ) {
                const target = i.object.userData.tile as TerrainHex;
                document.body.style.cursor = "wait";
                if (canPerformAction()) {
                  performAction({
                    battleId: battle.current.id,
                    userId: userId.current,
                    actionId: action.current.id,
                    longitude: target.col,
                    latitude: target.row,
                    version: battle.current.version,
                  });
                }
                return false;
              }
            }
            return true;
          });
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Sprite mixer for sprite animations
      const spriteMixer = SpriteMixer();

      // Callback on sprite animations
      // spriteMixer.addEventListener("finished", function (event) {});

      // Render the image
      let animationId = 0;
      const clock = new Clock();
      clock.start();
      function render() {
        // Use clock for animating sprites
        spriteMixer.update(clock.getDelta());

        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Assume we have battle and a grid
        if (userData && battle.current && grid.current) {
          // Get the selected user
          const user = battle.current.usersState.find(
            (u) => u.userId === userId.current,
          );

          // Draw all users on the map + indicators for positions with multiple users
          drawCombatUsers({
            group_users: group_users,
            users: battle.current.usersState,
            grid: grid.current,
          });

          // Draw all ground effects on the map
          drawCombatEffects({
            groupGround: group_ground,
            battle: battle.current,
            grid: grid.current,
            animationId,
            spriteMixer,
          });

          // Highlight information on user hover
          userHighlights = highlightUsers({
            group_tiles,
            group_users,
            raycaster,
            userId: userId.current,
            users: battle.current.usersState,
            currentHighlights: userHighlights,
          });

          // Detect intersections with tiles for movement/action
          if (user) {
            highlights = highlightTiles({
              group_tiles,
              raycaster,
              user,
              timeDiff,
              action: action.current,
              battle: battle.current,
              grid: grid.current,
              currentHighlights: highlights,
            });
          }

          // Highlight tooltips when hovering on battlefield
          tooltips = highlightTooltips({
            group_ground,
            raycaster,
            battle: battle.current,
            currentTooltips: tooltips,
          });
        }

        // Trackball updates
        controls.update();

        // Render the scene
        animationId = requestAnimationFrame(render);
        renderer?.render(scene, camera);
      }
      render();

      // Remove the mouseover listener
      return () => {
        void setBattleAtom(undefined);
        window.removeEventListener("resize", handleResize);
        sceneRef.removeEventListener("mousemove", onDocumentMouseMove);
        sceneRef.removeEventListener("mouseleave", onDocumentMouseLeave);
        sceneRef.removeChild(renderer.domElement);
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  // Derived variables
  const showNextMatch =
    result?.outcome === "Won" && (battleType === "ARENA" || battleType === "TRAINING");
  const showTravelBtn = battleType === "QUEST";
  const arenaOpponentId = battle.current?.usersState.find(
    (u) => u.userId !== suid && !u.isSummon && u.isAi,
  )?.userId;
  const initiveWinner = battle.current?.usersState.find(
    (u) => u.userId === battle.current?.activeUserId,
  );
  const toHospital = result && result.curHealth <= 0 && battleType !== "SPARRING";
  return (
    <>
      <div ref={mountRef}></div>
      {webglError && <WebGlError />}
      {/* BATTLE LOBBY SCREEN */}
      {isInLobby &&
        battle.current &&
        PvpBattleTypes.includes(battle.current.battleType) && (
          <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
            <div className="flex flex-col items-center justify-center text-white h-full">
              <p className="p-5 text-5xl">Waiting for opponent</p>
              <p className="text-3xl">
                Time Left:{" "}
                <Countdown targetDate={battle.current.createdAt} timeDiff={timeDiff} />
              </p>
              <p className="text-xl mt-5 mb-2 font-bold flex flex-row">
                Initiative Winner: {initiveWinner?.username}{" "}
                <Link href="/manual/combat">
                  <HelpCircle className="ml-2 h6 w-6 hover:text-orange-500" />
                </Link>
              </p>
              <div className="flex flex-row gap-4">
                {battle.current.usersState
                  .filter((u) => u.isOriginal && !u.isAi)
                  .map((u, i) => {
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center relative font-bold"
                      >
                        <Image
                          alt={`roll-${u.userId}`}
                          src="/combat/d20.webp"
                          height={80}
                          width={80}
                        ></Image>
                        <p className="absolute text-lg top-10">
                          {Math.floor(u.initiative)}
                        </p>
                        <p>{u.username}</p>{" "}
                        {u.iAmHere ? (
                          <CheckCircle className="h-6 w-6" />
                        ) : (
                          <ClockIcon className="h-6 w-6" />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      {/* FINAL DONE SCREEN */}
      {result && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
          <div className="text-center text-white">
            <p className="p-5 pb-2 text-3xl">You {result.outcome}</p>
            <div className=" grid grid-cols-2">
              {result.experience > 0 && (
                <p>Experience Points: {result.experience.toFixed(2)}</p>
              )}
              {result.ninjutsuOffence > 0 && (
                <p>Offensive Ninjutsu: {result.ninjutsuOffence.toFixed(2)}</p>
              )}
              {result.ninjutsuDefence > 0 && (
                <p>Defensive Ninjutsu: {result.ninjutsuDefence.toFixed(2)}</p>
              )}
              {result.taijutsuOffence > 0 && (
                <p>Offensive Taijutsu: {result.taijutsuOffence.toFixed(2)}</p>
              )}
              {result.taijutsuDefence > 0 && (
                <p>Defensive Taijutsu: {result.taijutsuDefence.toFixed(2)}</p>
              )}
              {result.genjutsuOffence > 0 && (
                <p>Offensive Genjutsu: {result.genjutsuOffence.toFixed(2)}</p>
              )}
              {result.genjutsuDefence > 0 && (
                <p>Defensive Genjutsu: {result.genjutsuDefence.toFixed(2)}</p>
              )}
              {result.bukijutsuOffence > 0 && (
                <p>Offensive Bukijutsu: {result.bukijutsuOffence.toFixed(2)}</p>
              )}
              {result.bukijutsuDefence > 0 && (
                <p>Defensive Bukijutsu: {result.bukijutsuDefence.toFixed(2)}</p>
              )}
              {result.intelligence > 0 && (
                <p>Intelligence: {result.intelligence.toFixed(2)}</p>
              )}
              {result.villagePrestige !== 0 && (
                <p>Village Prestige: {result.villagePrestige.toFixed(2)}</p>
              )}
              {result.villageTokens !== 0 && (
                <p>Village Tokens: {result.villageTokens.toFixed(2)}</p>
              )}
              {result.clanPoints !== 0 && (
                <p>Clan points: {result.clanPoints.toFixed(2)}</p>
              )}
              {result.money > 0 && <p>Money gained: {result.money.toFixed(2)}</p>}
              {result.money < 0 && <p>Money lost: {result.money.toFixed(2)}</p>}
              {result.strength > 0 && <p>Strength: {result.strength.toFixed(2)}</p>}
              {result.willpower > 0 && <p>Willpower: {result.willpower.toFixed(2)}</p>}
              {result.speed > 0 && <p>Speed: {result.speed.toFixed(2)}</p>}
            </div>
            <div className="p-5 flex flex-row justify-center gap-2">
              <Link
                href={toHospital ? "/hospital" : "/profile"}
                className={`${showNextMatch || showTravelBtn ? "basis-1/2" : "basis-1/1"} w-full`}
              >
                <Button id="return" className="w-full">
                  Return to {toHospital ? "Hospital" : "Profile"}
                </Button>
              </Link>
              {showNextMatch && arenaOpponentId && (
                <div>
                  <Button
                    id="return"
                    className="basis-1/2 w-full"
                    onClick={() =>
                      startArenaBattle({
                        aiId: arenaOpponentId,
                        stats:
                          battle.current?.battleType === "TRAINING"
                            ? statDistribution
                            : undefined,
                      })
                    }
                  >
                    Go Again
                  </Button>

                  <Button
                    id="heal-return"
                    className="basis-1/2 w-full mt-1"
                    onClick={() => battleArenaHealAndGo()}
                  >
                    Heal and Go Again (-500 Ryo)
                  </Button>
                </div>
              )}
              {showTravelBtn && (
                <Link href="/travel" className="basis-1/2">
                  <Button id="toTravel" className="w-full">
                    To Map
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      {/* FINAL DONE SCREEN */}
      {!hasFocus && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex justify-center items-center bg-black">
          <div className="text-center text-white relative m-auto flex flex-col items-center">
            <p className="p-5  pb-2 text-3xl">Not in Focus</p>
            <p className="italic pb-2">
              Battle data can only be streamed to one browser tab at once
            </p>
            <Button size="xl" onClick={() => location.reload()}>
              <Check className="w-8 h-8 mr-3" />
              Activate this Tab
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default Combat;
