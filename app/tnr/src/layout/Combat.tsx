import React from "react";
import { useRef, useEffect } from "react";

import { Vector2, OrthographicCamera, Group } from "three";
import { type Grid } from "honeycomb-grid";
import alea from "alea";
import Pusher from "pusher-js";

import { type TerrainHex } from "../libs/travel/types";
import { drawCombatBackground } from "../libs/combat/background";
import { drawCombatUsers } from "../libs/combat/movement";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { cleanUp, setupScene } from "../libs/travel/util";
import { type PathCalculator } from "../libs/travel/sector";
import { useRequiredUserData } from "../utils/UserContext";
import type { UserBattle } from "../utils/UserContext";

interface CombatProps {
  battle: UserBattle;
}

const Combat: React.FC<CombatProps> = (props) => {
  // Destructure props
  const { battle } = props;
  // References which shouldn't update
  const pathFinder = useRef<PathCalculator | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();

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

  useEffect(() => {
    if (mountRef.current && battle && userData?.battleId) {
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

      // Performance monitor
      // const stats = new Stats();
      // document.body.appendChild(stats.dom);

      // Listeners
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);

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
        drawCombatBackground(WIDTH, HEIGHT, scene, battle.background);
      grid.current = honeycombGrid;

      // Store current highlights and create a path calculator object
      // pathFinder.current = new PathCalculator(grid.current);

      // Intersections & highlights from interactions
      // let highlights = new Set<string>();
      // let currentTooltips = new Set<string>();

      // js groups for organization
      const group_users = new Group();

      // Set the origin
      // if (!origin.current) {
      //   origin.current = grid?.current?.getHex({
      //     col: userData.longitude,
      //     row: userData.latitude,
      //   });
      // }

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 0.3;
      controls.minZoom = 1;
      controls.maxZoom = 3;

      // Set initial position of controls & camera
      // if (isInSector && origin.current) {
      //   const { x, y } = origin.current.center;
      //   controls.target.set(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
      //   camera.position.copy(controls.target);
      // }

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
            // if (i.object.userData.type === "tile") {
            //   const target = i.object.userData.tile as TerrainHex;
            //   setTarget({ x: target.col, y: target.row });
            //   return false;
            // } else if (i.object.userData.type === "attack") {
            //   const target = users.find((u) => u.userId === i.object.userData.userId);
            //   if (target) {
            //     if (
            //       target.longitude === origin.current?.col &&
            //       target.latitude === origin.current?.row
            //     ) {
            //       attack({
            //         userId: target.userId,
            //         longitude: target.longitude,
            //         latitude: target.latitude,
            //         sector: sector,
            //       });
            //     } else {
            //       setTarget({ x: target.longitude, y: target.latitude });
            //     }
            //   }
            //   return false;
            // } else if (i.object.userData.type === "info") {
            //   const userId = i.object.userData.userId as string;
            //   void router.push(`/users/${userId}`);
            //   return false;
            // } else if (i.object.userData.type === "marker") {
            //   return false;
            // }
            // return true;
          });
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Render the image
      let animationId = 0;
      function render() {
        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Assume we have user, users and a grid
        if (battle?.usersState && grid.current) {
          // Draw all users on the map + indicators for positions with multiple users
          drawCombatUsers({
            group_users: group_users,
            users: battle.usersState,
            grid: grid.current,
          });
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
        mountRef.current = null;
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        if (userData.battleId) {
          pusher.unsubscribe(userData.battleId.toString());
        }
        void refetchUser();
      };
    }
  }, [battle]);

  return <div ref={mountRef}></div>;
};

export default Combat;
