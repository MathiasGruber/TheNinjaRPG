import { useRef, useEffect, useState } from "react";

import { useRouter } from "next/router";
import { type Village, type UserData } from "@prisma/client";
import { Grid, rectangle } from "honeycomb-grid";
import * as THREE from "three";
import { Orientation } from "honeycomb-grid";
import { createNoise2D } from "simplex-noise";
import alea from "alea";
import Stats from "three/examples/jsm/libs/stats.module";
import Pusher from "pusher-js";

import { api } from "../utils/api";
import { type GlobalTile, type TerrainHex, type SectorPoint } from "../libs/travel/map";
import { type HexagonalFaceMesh } from "../libs/travel/map";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../libs/travel/constants";
import { VILLAGE_LONG, VILLAGE_LAT } from "../libs/travel/constants";
import { calcIsInVillage } from "../libs/travel/controls";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { getTileInfo, getBackgroundColor } from "../libs/travel/biome";
import { defineHex } from "../libs/travel/map";
import { cleanUp } from "../libs/travel/map";
import { createUserSprite, createMultipleUserSprite } from "../libs/travel/map";
import { PathCalculator } from "../libs/travel/map";
import { useRequiredUser } from "../utils/UserContext";
import { show_toast } from "../libs/toast";
import { groupBy } from "../utils/grouping";
import { getUnique } from "../utils/grouping";

interface SectorProps {
  sector: number;
  tile: GlobalTile;
  target: SectorPoint | null;
  showVillage?: Village;
  setTarget: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
  setPosition: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
}

const Sector: React.FC<SectorProps> = (props) => {
  // Incoming props
  const { target, setTarget, setPosition } = props;

  // Convenience counter for forcing reload
  const [moves, setMoves] = useState(0);

  // References which shouldn't update
  const origin = useRef<TerrainHex | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pathFinder = useRef<PathCalculator | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);
  const mouse = new THREE.Vector2();

  // Data from db
  const { data: userData, refetch: refetchUser } = useRequiredUser();
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

  // Convenience method for finding hex
  const findHex = (point: SectorPoint) => {
    return grid?.current?.getHex({
      col: point.x,
      row: point.y,
    });
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
    }
  };

  const { mutate: move } = api.travel.moveInSector.useMutation({
    onSuccess: async (data) => {
      origin.current = findHex({ x: data.longitude, y: data.latitude });
      updateUsersList(data as UserData);
      setPosition({ x: data.longitude, y: data.latitude });
      setMoves((prev) => prev + 1);
      if (data.location !== userData?.location) {
        await refetchUser();
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
      // Websocket connection
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      const channel = pusher.subscribe(props.sector.toString());
      channel.bind("event", (data: UserData) => {
        if (data.userId !== userData.userId) updateUsersList(data);
      });

      // Performance monitor
      const stats = Stats();
      document.body.appendChild(stats.dom);

      // Mouse move listener
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);

      // Used for map size calculations
      const hexagonLengthToWidth = 0.885;
      const stackingDisplacement = 1.31;

      // Map size
      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH * hexagonLengthToWidth;
      const HEXSIZE = (WIDTH / SECTOR_WIDTH / 2) * stackingDisplacement;

      // Seeded noise generator for map gen
      const prng = alea(props.sector + 1);
      const noiseGen = createNoise2D(prng);

      // Defined sector grid
      const Tile = defineHex({
        dimensions: HEXSIZE,
        origin: { x: -HEXSIZE, y: -HEXSIZE },
        orientation: Orientation.FLAT,
      });
      grid.current = new Grid(
        Tile,
        rectangle({ width: SECTOR_WIDTH, height: SECTOR_HEIGHT })
      ).map((tile) => {
        const nx = tile.col / SECTOR_WIDTH - 0.5;
        const ny = tile.row / SECTOR_HEIGHT - 0.5;
        tile.level = noiseGen(nx, ny) / 2 + 0.5;
        tile.cost = 1;
        return tile;
      });

      // Setup scene and camara
      const scene = new THREE.Scene();
      console.log("WIDTH: ", WIDTH, "HEIGHT: ", HEIGHT);
      const camera = new THREE.OrthographicCamera(0, WIDTH, HEIGHT, 0, -10, 10);
      camera.zoom = 2;
      camera.updateProjectionMatrix();

      // Store current highlights and create a path calculator object
      pathFinder.current = new PathCalculator(grid.current);

      // Intersections & highlights from interactions
      let highlights = new Set<string>();
      let userTooltips = new Set<string>();
      let userCounters = new Set<string>();

      // Renderer the canvas
      const renderer = new THREE.WebGLRenderer();
      const raycaster = new THREE.Raycaster();
      renderer.setSize(WIDTH, HEIGHT);
      renderer.setClearColor(color, 1);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = false;
      renderer.sortObjects = false;
      mountRef.current.appendChild(renderer.domElement);

      // Window size listener
      function handleResize() {
        if (mountRef.current) {
          const WIDTH = mountRef.current.getBoundingClientRect().width;
          const HEIGHT = WIDTH * hexagonLengthToWidth;
          renderer.setSize(WIDTH, HEIGHT);
        }
      }
      window.addEventListener("resize", handleResize);

      // Create the hexagonal map
      const group_tiles = new THREE.Group();
      const group_edges = new THREE.Group();
      const group_users = new THREE.Group();
      const group_assets = new THREE.Group();

      // Draw the map
      const points = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x555555 });

      grid.current.forEach((tile) => {
        if (tile) {
          const { material, sprites } = getTileInfo(prng, tile, props.tile);
          if (!props.showVillage || !calcIsInVillage({ x: tile.col, y: tile.row })) {
            sprites.map((sprite) => group_assets.add(sprite));
          }

          const geometry = new THREE.BufferGeometry();
          const corners = tile.corners;
          const vertices = new Float32Array(
            points.map((p) => corners[p]).flatMap((p) => (p ? [p.x, p.y, -10] : []))
          );
          geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
          const mesh = new THREE.Mesh(geometry, material?.clone());
          mesh.name = `${tile.row},${tile.col}`;
          mesh.userData.type = "tile";
          mesh.userData.tile = tile;
          mesh.userData.hex = material?.color.getHex();
          mesh.userData.highlight = false;
          mesh.matrixAutoUpdate = false;
          group_tiles.add(mesh);

          const edges = new THREE.EdgesGeometry(geometry);
          edges.translate(0, 0, 1);
          const edgeMesh = new THREE.Line(edges, lineMaterial);
          edgeMesh.matrixAutoUpdate = false;
          group_edges.add(edgeMesh);
        }
      });

      // Reverse the order of objects in the group_assets
      group_assets.children.sort((a, b) => b.position.y - a.position.y);

      // Set the origin
      if (!origin.current) {
        origin.current = grid?.current?.getHex({
          col: userData.longitude,
          row: userData.latitude,
        });
      }

      // Add village in this sector
      if (props.showVillage) {
        const hex = grid.current.getHex({ col: VILLAGE_LONG, row: VILLAGE_LAT });
        if (hex) {
          const { height: h, x, y } = hex;
          // Village graphic
          const graphic = new THREE.TextureLoader().load(
            `map/${props.showVillage.name}.webp`
          );
          const graphicMat = new THREE.SpriteMaterial({ map: graphic });
          const graphicSprite = new THREE.Sprite(graphicMat);
          Object.assign(graphicSprite.scale, new THREE.Vector3(h * 2.2, h * 2.2, 1));
          Object.assign(graphicSprite.position, new THREE.Vector3(x, y, -7));
          group_assets.add(graphicSprite);
          // Village text
          const text = new THREE.TextureLoader().load(
            `villages/${props.showVillage.name}Marker.png`
          );
          const textMat = new THREE.SpriteMaterial({ map: text });
          const textSprite = new THREE.Sprite(textMat);
          Object.assign(textSprite.scale, new THREE.Vector3(h * 1.5, h * 0.5, 1));
          Object.assign(textSprite.position, new THREE.Vector3(x, y + h, -7));
          group_assets.add(textSprite);
        }
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
      // for (let i = 0; i < 3; i++) {
      //   users.push({ ...users[0], userId: i });
      // }

      // Render the image
      let lastTime = Date.now();
      let animationId = 0;
      let phi = 0;
      function render() {
        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);

        // Update the user position if a path is set
        if (userData && users) {
          const groups = groupBy(
            users.map((user) => ({
              ...user,
              group: !user.location.includes("Village")
                ? `${user.latitude},${user.longitude}`
                : user.location,
            })),
            "group"
          );
          const newUserCounts = new Set<string>();
          groups.forEach((tileUsers, group) => {
            tileUsers.forEach((user, i) => {
              // Add user if does not exist
              const userHex = findHex({ x: user.longitude, y: user.latitude });
              let userMesh = group_users.getObjectByName(user.userId);
              if (!userMesh && userHex) {
                userMesh = createUserSprite(user, userHex);
                group_users.add(userMesh);
              }
              // Get location
              if (userHex && userMesh && grid.current) {
                userMesh.userData.tile = userHex;
                let { x, y } = userHex.center;
                let spread = 0.1;
                if (
                  props.showVillage &&
                  calcIsInVillage({ x: userHex.col, y: userHex.row })
                ) {
                  const hex = grid.current.getHex({
                    col: VILLAGE_LONG,
                    row: VILLAGE_LAT,
                  });
                  if (hex) {
                    x = hex.center.x;
                    y = hex.center.y;
                    spread = 0.1;
                  }
                }
                const dt = Date.now() - lastTime;
                phi += (1 * Math.PI) / (5000 / dt);
                lastTime = Date.now();
                if (tileUsers.length > 1) {
                  const angle = (i / tileUsers.length) * 2 * Math.PI + phi;
                  x += spread * userHex.width * Math.sin(angle);
                  y -= spread * userHex.height * Math.cos(angle);
                }
                Object.assign(userMesh.position, new THREE.Vector3(-x, -y, 0));
              }
            });
            // Add indicator of how many users are there if more than 1
            const nUsers = tileUsers.length;
            if (nUsers > 2 && tileUsers[0]) {
              const user = tileUsers[0];
              const x = user.longitude;
              const y = user.latitude;
              const indicatorName = `${x}-${y}-${nUsers}`;
              const hex = findHex({ x: x, y: y });
              let indicatorMesh = group_users.getObjectByName(indicatorName);
              if (hex) {
                if (!indicatorMesh) {
                  indicatorMesh = createMultipleUserSprite(nUsers, "test", hex);
                  indicatorMesh.name = indicatorName;
                  indicatorMesh.position.set(-hex.center.x, -hex.center.y, 0);
                  group_users.add(indicatorMesh);
                } else {
                  indicatorMesh.visible = true;
                }
                newUserCounts.add(indicatorName);
              }
            }
          });
          group_users.children.sort((a, b) => b.position.y - a.position.y);
          // Hide all user counters which are not used anymore
          userCounters.forEach((name) => {
            if (!newUserCounts.has(name)) {
              const mesh = group_users.getObjectByName(name);
              if (mesh) mesh.visible = false;
            }
          });
          userCounters = newUserCounts;
          // Hide all users who are not in the sector anymore
        }

        // Detect intersections with users for tooltips with attack/info
        // If more than one user intersected, do not show
        const newUserTooltips = new Set<string>();
        const userIntersects = raycaster.intersectObjects(group_users.children);
        const userMesh = userIntersects.find(
          (i) =>
            i.object.parent?.userData.type === "user" &&
            i.object.parent?.userData.userId !== userData?.userId
        )?.object.parent;
        if (users && userMesh && userIntersects.length > 0) {
          const userHex = userMesh.userData.tile as TerrainHex;
          const locationUsers = users.filter(
            (g) =>
              g.latitude === userHex.row &&
              g.longitude === userHex.col &&
              g.userId !== userData?.userId
          );
          if (locationUsers.length === 1 && userMesh) {
            const userId = userMesh.userData.userId as string;
            const attack = userMesh?.children[2] as THREE.Sprite;
            const info = userMesh?.children[3] as THREE.Sprite;
            if (attack && userData?.userId !== userId) attack.visible = true;
            if (info) info.visible = true;
            newUserTooltips.add(userMesh.name);
            userTooltips.add(userMesh.name);
          }
        }
        userTooltips.forEach((userId) => {
          if (!newUserTooltips.has(userId)) {
            const user = group_users.getObjectByName(userId);
            if (user) {
              (user?.children[2] as THREE.Sprite).visible = false;
              (user?.children[3] as THREE.Sprite).visible = false;
            }
          }
        });
        userTooltips = newUserTooltips;

        // Detect intersections with tiles for movement
        const intersects = raycaster.intersectObjects(group_tiles.children);
        const newHighlights = new Set<string>();
        if (intersects.length > 0 && intersects[0]) {
          const intersected = intersects[0].object as HexagonalFaceMesh;
          // Fetch the shortest path on the map using A*
          const target = intersected.userData.tile;
          const shortestPath =
            origin.current &&
            pathFinder?.current?.getShortestPath(origin.current, target);
          // Highlight the path
          void shortestPath?.forEach((tile) => {
            const mesh = group_tiles.getObjectByName(
              `${tile.row},${tile.col}`
            ) as HexagonalFaceMesh;
            if (mesh.userData.highlight === false) {
              mesh.userData.highlight = true;
              mesh.material.color.offsetHSL(0, 0, 0.1);
            }
            newHighlights.add(mesh.name);
          });
        }

        // Remove highlights from tiles that are no longer in the path
        highlights.forEach((name) => {
          if (!newHighlights.has(name)) {
            const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
            mesh.userData.highlight = false;
            mesh.material.color.setHex(mesh.userData.hex);
          }
        });
        highlights = newHighlights;

        // Trackball updates
        controls.update();

        // Render the scene
        animationId = requestAnimationFrame(render);
        renderer.render(scene, camera);
        stats.update();
      }
      render();

      // Every time we refresh this component, fire off a move counter to make sure other useEffects are updated
      setMoves((prev) => prev + 1);

      // Remove the mouseover listener
      return () => {
        window.removeEventListener("resize", handleResize);
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
    </>
  );
};

export default Sector;
