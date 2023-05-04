import React from "react";
import { useRef, useEffect } from "react";

import { Vector2, OrthographicCamera, Group } from "three";
import { type Grid } from "honeycomb-grid";
import alea from "alea";
import Pusher from "pusher-js";

import { ReturnedUserState, type CombatAction } from "../libs/combat/types";
import { type TerrainHex } from "../libs/travel/types";
import { drawCombatBackground } from "../libs/combat/background";
import { drawCombatUsers, highlightTiles } from "../libs/combat/movement";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { cleanUp, setupScene } from "../libs/travel/util";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import { useRequiredUserData } from "../utils/UserContext";
import type { UserBattle } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

interface CombatProps {
  battle: UserBattle;
  action: CombatAction | null;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setActionPerc: React.Dispatch<React.SetStateAction<number | undefined>>;
}

const Combat: React.FC<CombatProps> = (props) => {
  console.log("COMBAT LAYOUT COMPONENT");
  // Destructure props
  const { setIsLoading, setActionPerc } = props;

  // References which shouldn't update
  const battle = useRef<UserBattle | null>(props.battle);
  const action = useRef<CombatAction | null>(props.action);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();

  // Mutations
  const { mutate: performAction } = api.combat.performAction.useMutation({
    onSuccess: (data) => {
      battle.current = data;
    },
    onError: (error) => {
      show_toast("Error acting", error.message, "error");
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsLoading(false);
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
        //setActionPerc(50);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [setActionPerc, userData]);

  useEffect(() => {
    action.current = props.action;
  }, [props]);

  useEffect(() => {
    if (mountRef.current && battle.current && userData?.battleId) {
      // Update the state containing sorrounding users on first load

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
      channel.bind("event", (data: any) => {
        console.log("DATA", data);
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
        if (battle.current) {
          const intersects = raycaster.intersectObjects(scene.children);
          intersects
            .filter((i) => i.object.visible)
            .every((i) => {
              if (
                i.object.userData.type === "tile" &&
                document.body.style.cursor !== "wait"
              ) {
                if (i.object.userData.canClick === true && action.current) {
                  const target = i.object.userData.tile as TerrainHex;
                  document.body.style.cursor = "wait";
                  setIsLoading(true);
                  performAction({
                    battleId: battle.current.id,
                    actionId: action.current.id,
                    longitude: target.col,
                    latitude: target.row,
                  });
                  return false;
                }
              }
              return true;
            });
        }
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

        // Performance monitor
        // stats.update(); // TODO: Remove this
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

  return <div ref={mountRef}></div>;
};

export default Combat;
