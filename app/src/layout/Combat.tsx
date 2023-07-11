import React, { useRef, useEffect } from "react";
import Link from "next/link";
import { Vector2, OrthographicCamera, Group, Clock } from "three";
import type { Grid } from "honeycomb-grid";

import Button from "./Button";
import { drawCombatBackground, drawCombatEffects } from "../libs/combat/drawing";
import { OrbitControls } from "../libs/threejs/OrbitControls";
import { SpriteMixer } from "../libs/threejs/SpriteMixer";
import { cleanUp, setupScene } from "../libs/travel/util";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import { highlightTiles } from "../libs/combat/drawing";
import { highlightTooltips } from "../libs/combat/drawing";
import { highlightUsers } from "../libs/combat/drawing";
import { availableUserActions } from "../libs/combat/actions";
import { actionSecondsAfterAction } from "../libs/combat/movement";
import { drawCombatUsers } from "../libs/combat/drawing";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import type { UserBattle } from "../utils/UserContext";
import type { ReturnedUserState } from "../libs/combat/types";
import type { CombatAction } from "../libs/combat/types";
import type { BattleState } from "../libs/combat/types";
import type { TerrainHex } from "../libs/hexgrid";

interface CombatProps {
  action: CombatAction | undefined;
  battleState: BattleState;
  userId: string;
  refetchBattle: () => void;
  setUserId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setActionPerc: React.Dispatch<React.SetStateAction<number | undefined>>;
  setBattleState: React.Dispatch<React.SetStateAction<BattleState | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  // Destructure props
  const { setBattleState, setActionPerc, setUserId, refetchBattle } = props;
  const { battleState } = props;
  const result = battleState.result;

  // References which shouldn't update
  const battle = useRef<UserBattle | null | undefined>(battleState.battle);
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

  // Mutation for starting a fight
  const { mutate: startArenaBattle } = api.combat.startArenaBattle.useMutation({
    onMutate: () => {
      console.log("starting arena battle");
      document.body.style.cursor = "wait";
    },
    onSuccess: async () => {
      setBattleState({ battle: undefined, result: null, isLoading: true });
      refetchBattle();
      await refetchUser();
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
        if (data) {
          battle.current = data.battle;
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

  // AI actions
  const { mutate: performAIAction, isLoading: isLoadingAI } =
    api.combat.performAction.useMutation({
      onSuccess: (data) => {
        if (data) {
          battle.current = data.battle;
          setBattleState({
            battle: data.battle,
            result: data.result,
            isLoading: false,
          });
        }
      },
    });

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
  const getActionPerc = (user: ReturnedUserState, timeDiff: number) => {
    const timePassed =
      (Date.now() - new Date(user.updatedAt).getTime() - timeDiff) / 1000;
    return Math.min((timePassed / COMBAT_SECONDS) * 100, 100);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (battle.current && userId.current) {
        const user = battle.current.usersState.find((u) => u.userId === userId.current);
        if (user?.updatedAt) {
          setActionPerc(getActionPerc(user, timeDiff));
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [setActionPerc, userData, timeDiff]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (
        battle.current &&
        userId.current &&
        !isLoadingUser &&
        !isLoadingAI &&
        !result
      ) {
        const usersState = battle.current.usersState;
        const user = usersState.find((u) => u.userId === userId.current);
        const ai = usersState.find(
          (u) => u.isAi && u.curHealth > 0 && u.controllerId === u.userId
        );
        if (user && ai && user.curHealth > 0 && !user.leftBattle) {
          const actions = availableUserActions(usersState, ai.userId, false);
          const hasAction = actions.find((a) => actionSecondsAfterAction(ai, a) > 0);
          if (hasAction && !isLoadingUser && !isLoadingAI) {
            performAIAction({
              battleId: battle.current.id,
              version: battle.current.version,
            });
          }
        }
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [performAIAction, isLoadingUser, isLoadingAI]);

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
  }, [battleId]);

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
        if (battle.current && grid.current) {
          // Get the selected user
          const user = battle.current.usersState.find(
            (u) => u.userId === userId.current
          );

          // If selected user is dead, select another user controlled by the same player
          if (user && user.curHealth <= 0) {
            const another = battle.current.usersState.find(
              (u) => u.controllerId === userData?.userId && u.curHealth > 0
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

          // Detect intersections with tiles for movement
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
      : result.experience > 0
      ? "Won"
      : "Fled"
    : "Unknown";
  const showNextMatch = outcome === "Won" && battle.current?.battleType === "ARENA";

  return (
    <>
      <div ref={mountRef}></div>
      {result && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
          <div className="text-center text-white">
            <p className="p-5 pb-2 text-3xl">You {outcome}</p>
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
