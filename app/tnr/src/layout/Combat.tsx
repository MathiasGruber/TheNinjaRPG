import React from "react";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { Vector2, OrthographicCamera, Group, TextureLoader, Clock } from "three";
import alea from "alea";
import Pusher from "pusher-js";
import type { Grid } from "honeycomb-grid";

import Button from "./Button";
import { drawCombatBackground, drawCombatEffects } from "../libs/combat/background";
import {
  drawCombatUsers,
  highlightTiles,
  highlightTooltips,
  highlightUsers,
} from "../libs/combat/movement";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { cleanUp, setupScene } from "../libs/travel/util";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import type { UserBattle } from "../utils/UserContext";
import type {
  ReturnedUserState,
  CombatAction,
  BattleState,
} from "../libs/combat/types";
import type { TerrainHex } from "../libs/travel/types";
import { SpriteMixer } from "../libs/travel/SpriteMixer";

interface CombatProps {
  action: CombatAction | undefined;
  battleState: BattleState;
  userId: string;
  setUserId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setActionPerc: React.Dispatch<React.SetStateAction<number | undefined>>;
  setBattleState: React.Dispatch<React.SetStateAction<BattleState | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  console.log("COMBAT LAYOUT COMPONENT");
  // Destructure props
  const { setBattleState, setActionPerc, setUserId, battleState } = props;
  const result = battleState.result;

  // References which shouldn't update
  const battle = useRef<UserBattle | null | undefined>(battleState.battle);
  const action = useRef<CombatAction | undefined>(props.action);
  const userId = useRef<string>(props.userId);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();

  // Mutations
  const { mutate: performAction } = api.combat.performAction.useMutation({
    onMutate: () => {
      console.log("onMutate");
      setBattleState({ battle: battle.current, result: null, isLoading: true });
    },
    onSuccess: (data) => {
      console.log("onSuccess");
      battle.current = data.battle;
      setBattleState({ battle: data.battle, result: data.result, isLoading: false });
    },
    onError: (error) => {
      show_toast("Error acting", error.message, "error");
    },
    onSettled: () => {
      document.body.style.cursor = "default";
    },
  });

  // Data from the DB
  const { data: userData, refetch: refetchUser, setBattle } = useRequiredUserData();

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
  const getActionPerc = (user: ReturnedUserState) => {
    const timePassed = (Date.now() - new Date(user.updatedAt).getTime()) / 1000;
    return Math.min((timePassed / COMBAT_SECONDS) * 100, 100);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (battle.current && userId.current) {
        const user = battle.current.usersState.find((u) => u.userId === userId.current);
        if (user?.updatedAt) {
          setActionPerc(getActionPerc(user));
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [setActionPerc, userData]);

  useEffect(() => {
    action.current = props.action;
    userId.current = props.userId;
  }, [props]);

  useEffect(() => {
    if (mountRef.current && battle.current && userData?.battleId) {
      // Is user done in battle?
      let isDone = false;

      // Used for map size calculations
      const backgroundLengthToWidth = 576 / 1024;

      // Map size
      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH * backgroundLengthToWidth;

      // Websocket connection
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      const channel = pusher.subscribe(userData.battleId.toString());
      channel.bind("event", (data: UserBattle) => {
        console.log("PUSHER EVENT");
        battle.current = {
          ...data,
          usersState: data.usersState.map((user) => {
            const existingUser = battle.current?.usersState.find(
              (u) => u.userId === user.userId
            );
            if (existingUser) {
              return { ...existingUser, ...user };
            } else {
              return user;
            }
          }),
        };
        // If user hits 0 health, submit a wait action, which will fetch result & update
        const user = battle.current.usersState?.find(
          (u) => u.userId === userId.current
        );
        if (user && user.cur_health <= 0 && !isDone) {
          isDone = true;
          performAction({
            battleId: battle.current.id,
            userId: userId.current,
            actionId: "wait",
            longitude: user.longitude,
            latitude: user.latitude,
            version: battle.current.version,
          });
        }
      });

      // Listeners
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);
      mountRef.current.addEventListener("mouseleave", onDocumentMouseLeave, false);

      // Seeded noise generator for map gen
      const prng = alea(userData.battleId);

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
      camera.zoom = 1.5;
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
        console.log("CLick");
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
                  u.cur_health > 0 &&
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
          if (user && user.cur_health <= 0) {
            const another = battle.current.usersState.find(
              (u) => u.controllerId === userData?.userId && u.cur_health > 0
            );
            if (another) setUserId(another.userId);
          }

          // Draw all users on the map + indicators for positions with multiple users
          drawCombatUsers({
            group_users: group_users,
            users: battle.current.usersState,
            grid: grid.current,
            spriteMixer,
          });

          // Draw all effects on the map
          drawCombatEffects({
            group_ground: group_ground,
            effects: battle.current.groundEffects,
            grid: grid.current,
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

      // Every time we refresh this component, fire off a move counter to make sure other useEffects are updated
      // setMoves((prev) => prev + 1);

      // Remove the mouseover listener
      return () => {
        console.log("CLEARING COMBAT");
        void refetchUser();
        void setBattle(undefined);
        window.removeEventListener("resize", handleResize);
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        mountRef.current?.removeEventListener("mouseleave", onDocumentMouseLeave);
        mountRef.current = null;
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        if (userData.battleId) {
          pusher.unsubscribe(userData.battleId.toString());
        }
      };
    }
  }, []);

  return (
    <>
      <div ref={mountRef}></div>
      {result && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-90">
          <div className="text-center text-white">
            <p className="p-5 pb-2 text-3xl">
              You {result.cur_health <= 0 ? "Lost" : "Won"}
            </p>
            {result.elo_pvp && <p>Your PVP rating: {result.elo_pvp}</p>}
            {result.experience > 0 && <p>Experience Points: {result.experience}</p>}
            <div className="p-5">
              <Link href={result.cur_health <= 0 ? "/hospital" : "/profile"}>
                <Button
                  id="return"
                  label={`Return to ${result.cur_health <= 0 ? "Hospital" : "Profile"}`}
                />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Combat;
