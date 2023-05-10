import React from "react";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { Vector2, OrthographicCamera, Group } from "three";
import alea from "alea";
import Pusher from "pusher-js";
import type { Grid } from "honeycomb-grid";

import Button from "./Button";
import { drawCombatBackground } from "../libs/combat/background";
import { drawCombatUsers, highlightTiles } from "../libs/combat/movement";
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

interface CombatProps {
  action: CombatAction | undefined;
  battleState: BattleState;
  setActionPerc: React.Dispatch<React.SetStateAction<number | undefined>>;
  setBattleState: React.Dispatch<React.SetStateAction<BattleState | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  console.log(props);
  console.log("COMBAT LAYOUT COMPONENT");
  // Destructure props
  const { setBattleState, setActionPerc, battleState } = props;
  const result = battleState.result;

  // References which shouldn't update
  const battle = useRef<UserBattle | null | undefined>(battleState.battle);
  const action = useRef<CombatAction | undefined>(props.action);
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
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

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
      mouse.x = Infinity;
      mouse.y = Infinity;
    }
  };
  const getActionPerc = (user: ReturnedUserState) => {
    const timePassed = (Date.now() - new Date(user.updatedAt).getTime()) / 1000;
    return Math.min((timePassed / COMBAT_SECONDS) * 100, 100);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (battle.current) {
        const user = battle.current.usersState.find(
          (u) => u.userId === userData?.userId
        );
        if (user?.updatedAt) {
          setActionPerc(getActionPerc(user));
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [setActionPerc, userData]);

  useEffect(() => {
    action.current = props.action;
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
          (u) => u.userId === userData.userId
        );
        if (user && user.cur_health <= 0 && !isDone) {
          isDone = true;
          performAction({
            battleId: battle.current.id,
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
      const { group_tiles, group_edges, group_assets, honeycombGrid } =
        drawCombatBackground(WIDTH, HEIGHT, scene, battle.current.background, prng);
      grid.current = honeycombGrid;

      // Intersections & highlights from interactions
      let highlights = new Set<string>();
      // let currentTooltips = new Set<string>();

      // js groups for organization
      const group_users = new Group();

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 0.3;
      controls.minZoom = 1;
      controls.maxZoom = 3;

      // Add the group to the scene
      scene.add(group_tiles);
      scene.add(group_edges);
      scene.add(group_assets);
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
                  actionId: action.current.id,
                  longitude: target.col,
                  latitude: target.row,
                  version: battle.current.version,
                });
                return false;
              }
            }
            return true;
          });
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Render the image
      let animationId = 0;
      function render() {
        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Assume we have user, users and a grid
        if (battle.current?.usersState && grid.current) {
          // Draw all users on the map + indicators for positions with multiple users
          drawCombatUsers({
            group_users: group_users,
            users: battle.current.usersState,
            grid: grid.current,
          });

          // Detect intersections with tiles for movement
          if (userData) {
            highlights = highlightTiles({
              group_tiles,
              raycaster,
              action: action.current,
              userId: userData.userId,
              users: battle.current.usersState,
              grid: grid.current,
              currentHighlights: highlights,
            });
          }
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
        window.removeEventListener("resize", handleResize);
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        mountRef.current?.removeEventListener("mouseleave", onDocumentMouseLeave);
        mountRef.current = null;
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        if (userData.battleId) {
          pusher.unsubscribe(userData.battleId.toString());
        }
        void refetchUser();
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
