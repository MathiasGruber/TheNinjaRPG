import React from "react";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Vector2, OrthographicCamera, Group } from "three";
import { useRouter } from "next/router";
import { type Village, type UserData } from "@prisma/client";
import { type Grid } from "honeycomb-grid";
import alea from "alea";
// import Stats from "three/examples/jsm/libs/stats.module";
import Pusher from "pusher-js";

import AvatarImage from "./Avatar";
import Modal from "./Modal";
import { api } from "../utils/api";
import {
  type GlobalTile,
  type TerrainHex,
  type SectorPoint,
  type SectorUser,
} from "../libs/travel/types";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { getBackgroundColor } from "../libs/travel/biome";
import { cleanUp, setupScene } from "../libs/travel/util";
import { drawSectorBasics, drawVillage, drawUsers } from "../libs/travel/sector";
import { intersectUsers, intersectTiles } from "../libs/travel/sector";
import { PathCalculator, findHex } from "../libs/travel/sector";
import { useRequiredUserData } from "../utils/UserContext";
import { show_toast } from "../libs/toast";

interface SectorProps {
  sector: number;
  tile: GlobalTile;
  target: SectorPoint | null;
  showVillage?: Village;
  showSorrounding: boolean;
  setShowSorrounding: React.Dispatch<React.SetStateAction<boolean>>;
  setTarget: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
  setPosition: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
}

const Sector: React.FC<SectorProps> = (props) => {
  // Incoming props
  const { target, setTarget, setPosition } = props;

  // State pertaining to the sector
  const [moves, setMoves] = useState(0);
  const [sorrounding, setSorrounding] = useState<SectorUser[]>([]);

  // References which shouldn't update
  const origin = useRef<TerrainHex | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pathFinder = useRef<PathCalculator | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new Vector2();

  // Data from db
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const { data: users } = api.travel.getSectorData.useQuery(
    { sector: props.sector },
    { staleTime: Infinity }
  );

  // Router for forwarding
  const router = useRouter();

  // Convenience calculations
  const isInSector = userData?.sector === props.sector;

  // Background color for the map
  const { color } = getBackgroundColor(props.tile);

  // Update mouse position on mouse move
  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };

  // Movement based on ASDQWE keys
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (origin.current && pathFinder.current) {
      const x = origin.current.col;
      const y = origin.current.row;
      switch (event.key) {
        // Up & Down
        case "w":
          setTarget({ x: x, y: y + 1 });
          break;
        case "s":
          setTarget({ x: x, y: y - 1 });
          break;
        // High left & right
        case "q":
          setTarget({ x: x - 1, y: x % 2 === 0 ? y : y + 1 });
          break;
        case "e":
          setTarget({ x: x + 1, y: x % 2 === 0 ? y : y + 1 });
          break;
        // Low left & right
        case "a":
          setTarget({ x: x - 1, y: x % 2 === 0 ? y - 1 : y });
          break;
        case "d":
          setTarget({ x: x + 1, y: x % 2 === 0 ? y - 1 : y });
          break;
      }
    }
  };

  // Convenience method for updating user list
  const updateUsersList = (data: UserData) => {
    if (users) {
      const idx = users.findIndex((user) => user.userId === data.userId);
      if (idx !== -1) {
        users[idx] = data;
      } else {
        users.push(data);
      }
      // Remove users who are no longer in the sector
      (
        users
          .map((user, idx) => (user.sector !== props.sector ? idx : null))
          .filter((idx) => idx !== null) as number[]
      )
        .reverse()
        .map((idx) => users.splice(idx, 1));
    }
    setSorrounding(users || []);
  };

  const { mutate: move } = api.travel.moveInSector.useMutation({
    onSuccess: async (data) => {
      if (data) {
        origin.current = findHex(grid.current, { x: data.longitude, y: data.latitude });
        updateUsersList({
          ...userData,
          longitude: data.longitude,
          latitude: data.latitude,
          location: data.location,
        } as UserData);
        setPosition({ x: data.longitude, y: data.latitude });
        setMoves((prev) => prev + 1);
        if (data.location !== userData?.location) {
          console.log("LOCATION CHANGED; REFETCHING USER");
          await refetchUser();
        }
      }
    },
    onError: (error) => {
      show_toast("Error moving", error.message, "error");
    },
  });

  useEffect(() => {
    if (target && origin.current && pathFinder.current) {
      const targetHex = grid?.current?.getHex({ col: target.x, row: target.y });
      if (!targetHex) return;
      const path = pathFinder.current.getShortestPath(origin.current, targetHex);
      const next = path?.[1];
      if (next) {
        move({ longitude: next.col, latitude: next.row });
      }
    }
  }, [target, userData, moves, move]);

  useEffect(() => {
    if (mountRef.current && userData && users) {
      console.log("DRAWING SECTOR");
      // Update the state containing sorrounding users on first load
      setSorrounding(users || []);

      // Used for map size calculations
      const hexagonLengthToWidth = 0.885;

      // Map size
      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH * hexagonLengthToWidth;

      // Websocket connection
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      const channel = pusher.subscribe(props.sector.toString());
      channel.bind("event", (data: UserData) => {
        if (data.userId !== userData.userId) updateUsersList(data);
      });

      // Performance monitor
      // const stats = new Stats();
      // document.body.appendChild(stats.dom);

      // Listeners
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);
      document.addEventListener("keydown", onDocumentKeyDown, false);

      // Seeded noise generator for map gen
      const prng = alea(props.sector + 1);

      // Setup scene, renderer and raycaster
      const { scene, renderer, raycaster, handleResize } = setupScene({
        mountRef: mountRef,
        width: WIDTH,
        height: HEIGHT,
        sortObjects: false,
        color: color,
        colorAlpha: 1,
        width2height: hexagonLengthToWidth,
      });
      mountRef.current.appendChild(renderer.domElement);

      // Setup camara
      const camera = new OrthographicCamera(0, WIDTH, HEIGHT, 0, -10, 10);
      camera.zoom = 2;
      camera.updateProjectionMatrix();

      // Draw the map
      const { group_tiles, group_edges, group_assets, honeycombGrid } =
        drawSectorBasics(WIDTH, prng, props.showVillage !== undefined, props.tile);
      grid.current = honeycombGrid;

      // Draw any village in this sector
      if (props.showVillage) {
        const village = drawVillage(props.showVillage.name, grid.current);
        group_assets.add(village);
      }

      // Store current highlights and create a path calculator object
      pathFinder.current = new PathCalculator(grid.current);

      // Intersections & highlights from interactions
      let highlights = new Set<string>();
      let currentTooltips = new Set<string>();

      // js groups for organization
      const group_users = new Group();

      // Set the origin
      if (!origin.current) {
        origin.current = grid?.current?.getHex({
          col: userData.longitude,
          row: userData.latitude,
        });
      }

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 1.0;
      controls.minZoom = 1;
      controls.maxZoom = 3;

      // Set initial position of controls & camera
      if (isInSector && origin.current) {
        const { x, y } = origin.current.center;
        controls.target.set(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        camera.position.copy(controls.target);
      }

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
            if (i.object.userData.type === "tile") {
              const target = i.object.userData.tile as TerrainHex;
              setTarget({ x: target.col, y: target.row });
              return false;
            } else if (i.object.userData.type === "attack") {
              console.log("ATTACK", i.object.userData.userId);
              return false;
            } else if (i.object.userData.type === "info") {
              const userId = i.object.userData.userId as string;
              void router.push(`/users/${userId}`);
              return false;
            } else if (i.object.userData.type === "marker") {
              return false;
            }
            return true;
          });
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Add some more users for testing
      // if (users[0]) {
      //   for (let i = 0; i < 16; i++) {
      //     users.push({ ...users[0], userId: i.toString() });
      //   }
      // }

      // Render the image
      let lastTime = Date.now();
      let animationId = 0;
      let userAngle = 0;
      function render() {
        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Assume we have user, users and a grid
        if (userData && users && grid.current) {
          // Draw all users on the map + indicators for positions with multiple users
          userAngle = drawUsers({
            group_users: group_users,
            users: users,
            grid: grid.current,
            showVillage: props.showVillage !== undefined,
            lastTime: lastTime,
            angle: userAngle,
          });
          lastTime = Date.now();

          // Draw interactions with user sprites
          currentTooltips = intersectUsers({
            group_users,
            raycaster,
            users,
            userData,
            currentTooltips,
          });
        }

        // Detect intersections with tiles for movement
        if (pathFinder.current && origin.current) {
          highlights = intersectTiles({
            group_tiles,
            raycaster,
            pathFinder: pathFinder.current,
            origin: origin.current,
            currentHighlights: highlights,
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
      setMoves((prev) => prev + 1);

      // Remove the mouseover listener
      return () => {
        console.log("CLEARING SECTOR");
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("keydown", onDocumentKeyDown, false);
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        mountRef.current = null;
        pusher.unsubscribe(props.sector.toString());
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        void refetchUser();
      };
    }
  }, [props.sector, users]);

  return (
    <>
      <div ref={mountRef}></div>
      {props.showSorrounding && users && userData && origin.current && (
        <SorroundingUsers
          setIsOpen={props.setShowSorrounding}
          users={sorrounding}
          userId={userData.userId}
          hex={origin.current}
        />
      )}
    </>
  );
};

export default Sector;

interface SorroundingUsersProps {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userId: string;
  hex: TerrainHex;
  users: SectorUser[];
}

const SorroundingUsers: React.FC<SorroundingUsersProps> = (props) => {
  const users = props.users.filter(
    (user) =>
      user.latitude === props.hex.row &&
      user.longitude === props.hex.col &&
      user.userId !== props.userId
  );
  return (
    <Modal title="Sorrounding Area" setIsOpen={props.setIsOpen} isValid={false}>
      <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10">
        {users.map((user, i) => (
          <div key={i} className="relative">
            <div className="absolute right-0 top-0 z-50 w-1/3 hover:opacity-80">
              <Link href="/">
                <Image
                  src={"/map/attack.png"}
                  width={40}
                  height={40}
                  alt={`Attack-${user.userId}`}
                />
              </Link>
            </div>
            <div className="absolute left-0 top-0 z-50 w-1/3 hover:opacity-80">
              <Link href={`/users/${user.userId}`}>
                <Image
                  src={"/map/info.png"}
                  width={40}
                  height={40}
                  alt={`Info-${user.userId}`}
                />
              </Link>
            </div>
            <div className="p-3">
              <AvatarImage
                href={user.avatar}
                userId={user.userId}
                alt={user.username}
                size={512}
                priority
              />
            </div>
            {user.username}
          </div>
        ))}
      </div>
    </Modal>
  );
};
