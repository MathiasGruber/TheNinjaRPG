import React, { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { Vector2, OrthographicCamera, Group, Clock } from "three";
import type { Grid } from "honeycomb-grid";
import Button from "./Button";
import Countdown from "./Countdown";
import { drawCombatBackground, drawCombatEffects } from "../libs/combat/drawing";
import { OrbitControls } from "../libs/threejs/OrbitControls";
import { COMBAT_SECONDS, COMBAT_LOBBY_SECONDS } from "../libs/combat/constants";
import { SpriteMixer } from "../libs/threejs/SpriteMixer";
import { cleanUp, setupScene } from "../libs/travel/util";
import { highlightTiles } from "../libs/combat/drawing";
import { highlightTooltips } from "../libs/combat/drawing";
import { highlightUsers } from "../libs/combat/drawing";
import { calcActiveUser } from "../libs/combat/actions";
import { drawCombatUsers } from "../libs/combat/drawing";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import type { ReturnedBattle } from "../libs/combat/types";
import type { CombatAction } from "../libs/combat/types";
import type { BattleState } from "../libs/combat/types";
import type { TerrainHex } from "../libs/hexgrid";

interface CombatProps {
  action: CombatAction | undefined;
  battleState: BattleState;
  userId: string;
  refetchBattle: () => void;
  setUserId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setBattleState: React.Dispatch<React.SetStateAction<BattleState | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  // Destructure props
  const { setBattleState, setUserId, refetchBattle } = props;
  const { battleState } = props;
  const result = battleState.result;
  const utils = api.useContext();

  // State
  const [isInLobby, setIsInLobby] = useState<boolean>(true);

  // References which shouldn't update
  const battle = useRef<ReturnedBattle | null | undefined>(battleState.battle);
  const action = useRef<CombatAction | undefined>(props.action);
  const userId = useRef<string>(props.userId);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();
  const battleId = battle.current?.id;

  // Data from the DB
  const {
    data: userData,
    pusher,
    timeDiff,
    refetch: refetchUser,
    setBattle,
  } = useRequiredUserData();
  const suid = userData?.userId;

  // Mutation for starting a fight
  const { mutate: startArenaBattle } = api.combat.startArenaBattle.useMutation({
    onMutate: () => {
      document.body.style.cursor = "wait";
    },
    onSuccess: async (data) => {
      if (data.success) {
        setBattle(undefined);
        setBattleState({ battle: undefined, result: null, isLoading: true });
        refetchBattle();
        await refetchUser();
      } else {
        show_toast("Error attacking", data.message, "info");
      }
    },
    onError: (error) => {
      show_toast("Error attacking", error.message, "error");
    },
    onSettled: () => {
      document.body.style.cursor = "default";
    },
  });

  // User Action
  const { mutate: performAction, isLoading: isLoadingUser } =
    api.combat.performAction.useMutation({
      onMutate: () => {
        setBattleState({ battle: battle.current, result: null, isLoading: true });
      },
      onSuccess: (data) => {
        // Notifications (if any)
        if (data.notification) {
          show_toast("Notification", data.notification, "info");
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
            }
          );
        }
        // Update battle state
        if (data.updateClient) {
          battle.current = data.battle;
          setBattle(battle.current);
          setBattleState({
            battle: data.battle,
            result: data.result,
            isLoading: false,
          });
        }
      },
      onError: (error) => {
        show_toast("Error acting", error.message, "error");
      },
      onSettled: () => {
        document.body.style.cursor = "default";
      },
    });

  // Handle key-presses
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (battle.current) {
      const { actor } = calcActiveUser(battle.current, suid);
      switch (event.key) {
        case "w":
          if (actor.userId === suid) {
            document.body.style.cursor = "wait";
            performAction({
              battleId: battle.current.id,
              userId: userId.current,
              actionId: "wait",
              longitude: actor.longitude,
              latitude: actor.latitude,
              version: battle.current.version,
            });
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
      if (suid && battle.current && userId.current && !isLoadingUser && !result) {
        const { actor } = calcActiveUser(battle.current, suid);
        // Scenario 1: it is now AIs turn, perform action
        if (actor.isAi && actor.controllerId === actor.userId) {
          performAction({
            battleId: battle.current.id,
            version: battle.current.version,
          });
        } else {
          // Scenario 2: more than 10 seconds passed, or actor is no longer the same as active user - refetch
          const updatePassed =
            Date.now() - timeDiff - battle.current.updatedAt.getTime();
          const createPassed =
            Date.now() - timeDiff - battle.current.createdAt.getTime();
          const check1 = updatePassed > COMBAT_SECONDS * 1000;
          const check2 = createPassed > (COMBAT_LOBBY_SECONDS + COMBAT_SECONDS) * 1000;
          const newActor = actor.userId !== battle.current.activeUserId;
          if ((check1 && check2) || newActor) {
            refetchBattle();
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingUser, result, suid]);

  useEffect(() => {
    action.current = props.action;
    userId.current = props.userId;
    battle.current = props.battleState.battle;
    if (props.battleState.result) {
      const update = async () => {
        await refetchUser();
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
          refetchBattle();
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
    if (mountRef.current && battle.current && userData?.battleId) {
      // Used for map size calculations
      const backgroundLengthToWidth = 576 / 1024;

      // Map size
      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH * backgroundLengthToWidth;

      // Listeners
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);
      mountRef.current.addEventListener("mouseleave", onDocumentMouseLeave, false);

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
      mountRef.current.appendChild(renderer.domElement);

      // Setup camara
      const camera = new OrthographicCamera(0, WIDTH, HEIGHT, 0, -10, 10);
      camera.zoom = 1.75;
      camera.updateProjectionMatrix();

      // Draw the background
      const { group_tiles, group_edges, honeycombGrid } = drawCombatBackground(
        WIDTH,
        HEIGHT,
        scene,
        battle.current.background
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
                performAction({
                  battleId: battle.current.id,
                  userId: userId.current,
                  actionId: action.current.id,
                  longitude: target.col,
                  latitude: target.row,
                  version: battle.current.version,
                });
                return false;
              }
            } else if (i.object.userData.type === "userMarker" && battle.current) {
              const target = battle.current.usersState.find(
                (u) =>
                  u.userId === i.object.userData.userId &&
                  u.curHealth > 0 &&
                  u.controllerId === userData.userId
              );
              if (target) setUserId(target.userId);
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
            (u) => u.userId === userId.current
          );

          // If selected user is dead, select another user controlled by the same player
          if (user && user.curHealth <= 0) {
            const another = battle.current.usersState.find(
              (u) => u.controllerId === userData.userId && u.curHealth > 0
            );
            if (another) setUserId(another.userId);
          }

          // Draw all users on the map + indicators for positions with multiple users
          drawCombatUsers({
            group_users: group_users,
            users: battle.current.usersState,
            grid: grid.current,
          });

          // Draw all effects on the map
          drawCombatEffects({
            group_ground: group_ground,
            effects: battle.current.groundEffects,
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
        renderer.render(scene, camera);
      }
      render();

      // Remove the mouseover listener
      return () => {
        void setBattle(undefined);
        window.removeEventListener("resize", handleResize);
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        mountRef.current?.removeEventListener("mouseleave", onDocumentMouseLeave);
        mountRef.current?.removeChild(renderer.domElement);
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
      };
    }
  }, [battleId]);

  // Derived variables
  const outcome = result
    ? result.curHealth <= 0
      ? "Lost"
      : result.experience > 0.01
      ? "Won"
      : "Fled"
    : "Unknown";
  const showNextMatch = outcome === "Won" && battle.current?.battleType === "ARENA";

  return (
    <>
      <div ref={mountRef}></div>
      {isInLobby && battle.current && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
          <div className="flex flex-col items-center justify-center text-white h-full">
            <p className="p-5 text-5xl">Waiting for opponent</p>
            <p className="text-3xl">
              Time Left: <Countdown targetDate={battle.current.createdAt} />
            </p>
          </div>
        </div>
      )}
      {result && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
          <div className="text-center text-white">
            <p className="p-5 pb-2 text-3xl">You {outcome}</p>
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
              {result.money !== 0 && <p>Money: {result.money.toFixed(2)}</p>}
              {result.strength > 0 && <p>Strength: {result.strength.toFixed(2)}</p>}
              {result.willpower > 0 && <p>Willpower: {result.willpower.toFixed(2)}</p>}
              {result.speed > 0 && <p>Speed: {result.speed.toFixed(2)}</p>}
            </div>
            <div className="p-5 flex flex-row justify-center">
              <Link
                href={result.curHealth <= 0 ? "/hospital" : "/profile"}
                className={showNextMatch ? "basis-1/2" : "basis-1/1"}
              >
                <Button
                  id="return"
                  label={`Return to ${result.curHealth <= 0 ? "Hospital" : "Profile"}`}
                />
              </Link>
              {showNextMatch && (
                <Button
                  className="basis-1/2"
                  id="return"
                  label={`Go Again`}
                  onClick={() => startArenaBattle()}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Combat;
