import { useRef, useEffect, useState } from "react";

import { type Village } from "@prisma/client";
import { Grid, rectangle } from "honeycomb-grid";
import * as THREE from "three";
import { Orientation } from "honeycomb-grid";
import { createNoise2D } from "simplex-noise";
import alea from "alea";
import Stats from "three/examples/jsm/libs/stats.module";

import { api } from "../utils/api";
import { type GlobalTile, type TerrainHex, type SectorPoint } from "../libs/travel/map";
import { type HexagonalFaceMesh } from "../libs/travel/map";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../libs/travel/constants";
import { VILLAGE_LONG, VILLAGE_LAT } from "../libs/travel/constants";
import { calcIsInVillage } from "../libs/travel/controls";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { getTileInfo, getBackgroundColor } from "../libs/travel/biome";
import { defineHex } from "../libs/travel/map";
import { createUserSprite } from "../libs/travel/map";
import { PathCalculator } from "../libs/travel/map";
import { useRequiredUser } from "../utils/UserContext";
import { show_toast } from "../libs/toast";

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

  // Convenience calculations
  const isInSector = userData?.sector === props.sector;

  // Background color for the map
  const { color } = getBackgroundColor(props.tile);

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

  const { mutate: move } = api.travel.moveInSector.useMutation({
    onSuccess: async (data) => {
      if (userData && target) {
        setPosition({ x: data.longitude, y: data.latitude });
        origin.current = findHex({ x: data.longitude, y: data.latitude });
        if (data.refetchUser) {
          await refetchUser();
        }
        setMoves((prev) => prev + 1);
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
    if (mountRef.current && userData) {
      console.log("DRAWING THE SCENE AGAIN!");

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
      const camera = new THREE.OrthographicCamera(0, WIDTH, HEIGHT, 0, -100, 100);
      camera.zoom = 2;
      camera.updateProjectionMatrix();

      // Mouse intersections
      let intersected: HexagonalFaceMesh | undefined = undefined;

      // Store current highlights and create a path calculator object
      pathFinder.current = new PathCalculator(grid.current);
      let highlights = new Set<string>();

      // Renderer the canvas
      const renderer = new THREE.WebGLRenderer({ alpha: true });
      const raycaster = new THREE.Raycaster();
      renderer.setSize(WIDTH, HEIGHT);
      renderer.setClearColor(color, 1);
      renderer.setPixelRatio(window.devicePixelRatio);
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
            points.map((p) => corners[p]).flatMap((p) => (p ? [p.x, p.y, 0] : []))
          );
          geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
          const mesh = new THREE.Mesh(geometry, material?.clone());
          mesh.name = `${tile.row},${tile.col}`;
          mesh.userData.tile = tile;
          mesh.userData.hex = material?.color.getHex();
          mesh.userData.highlight = false;
          group_tiles.add(mesh);

          const edges = new THREE.EdgesGeometry(geometry);
          edges.translate(0, 0, 1);
          const edgeMesh = new THREE.Line(edges, lineMaterial);
          group_edges.add(edgeMesh);
        }
      });

      // Reverse the order of objects in the group_assets
      group_assets.children.sort((a, b) => b.position.y - a.position.y);

      // Set the origin
      origin.current = grid?.current?.getHex({
        col: userData.longitude,
        row: userData.latitude,
      });

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
          Object.assign(graphicSprite.position, new THREE.Vector3(x, y, 2));
          group_assets.add(graphicSprite);
          // Village text
          const text = new THREE.TextureLoader().load(
            `villages/${props.showVillage.name}Marker.png`
          );
          const textMat = new THREE.SpriteMaterial({ map: text });
          const textSprite = new THREE.Sprite(textMat);
          Object.assign(textSprite.scale, new THREE.Vector3(h * 1.5, h * 0.5, 1));
          Object.assign(textSprite.position, new THREE.Vector3(x, y + h, 2));
          group_assets.add(textSprite);
        }
      }

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 1.0;
      controls.minZoom = 1;
      controls.maxZoom = 2;

      // Add user on map
      if (isInSector && origin.current) {
        const userMesh = createUserSprite(userData, origin.current);
        group_users.add(userMesh);
        const { x, y } = origin.current.center;
        // Set initial position of controls & camera
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
        if (intersects.length > 0) {
          const target = (intersects?.[0]?.object as HexagonalFaceMesh).userData.tile;
          setTarget({ x: target.col, y: target.row });
        }
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Render the image
      function render() {
        // Update the user position if a path is set
        if (userData) {
          const userMesh = group_users.getObjectByName(userData.userId);
          if (origin.current && grid.current && userMesh) {
            let { x, y } = origin.current.center;
            if (
              props.showVillage &&
              calcIsInVillage({ x: origin.current.col, y: origin.current.row })
            ) {
              const hex = grid.current.getHex({ col: VILLAGE_LONG, row: VILLAGE_LAT });
              if (hex) {
                x = hex.center.x;
                y = hex.center.y;
              }
            }
            Object.assign(userMesh.position, new THREE.Vector3(-x, -y, 0));
          }
        }

        // Use raycaster to detect mouse intersections
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        if (intersects.length > 0) {
          if (intersects[0] && intersects[0].object != intersected) {
            intersected = intersects[0].object as HexagonalFaceMesh;
          }
        } else {
          intersected = undefined;
        }

        // If any intersections
        const newHighlights = new Set<string>();
        if (intersected && userData) {
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
        requestAnimationFrame(render);
        renderer.render(scene, camera);
        stats.update();
      }
      render();

      // Every time we refresh this component, fire off a move counter to make sure other useEffects are updated
      setMoves((prev) => prev + 1);

      // Remove the mouseover listener
      return () => {
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        window.removeEventListener("resize", handleResize);
        renderer.dispose();
        mountRef.current = null;
      };
    }
  }, [props.sector]);

  return (
    <>
      <div ref={mountRef}></div>
    </>
  );
};

export default Sector;
