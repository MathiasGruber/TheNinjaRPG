import { useRef, useEffect, useState } from "react";

import { Grid, rectangle } from "honeycomb-grid";
import * as THREE from "three";
import { Orientation } from "honeycomb-grid";
import { createNoise2D } from "simplex-noise";
import alea from "alea";

import { api } from "../utils/api";
import { type MapTile, type TerrainHex } from "../libs/travel/map";
import { type HexagonalFaceMesh } from "../libs/travel/map";
import { OrbitControls } from "../libs/travel/OrbitControls";
import { getTileInfo, getBackgroundColor } from "../libs/travel/biome";
import { defineHex } from "../libs/travel/map";
import { createUserSprite } from "../libs/travel/map";
import { PathCalculator } from "../libs/travel/map";
import { useRequiredUser } from "../utils/UserContext";

interface SectorProps {
  sector: number;
  tile: MapTile;
  setPosition: React.Dispatch<React.SetStateAction<[number, number] | null>>;
}

const Sector: React.FC<SectorProps> = (props) => {
  const { data: userData } = useRequiredUser();
  const [target, setTarget] = useState<TerrainHex | undefined>(undefined);
  const [moves, setMoves] = useState(0);
  const isInSector = userData?.sector === props.sector;
  const mouse = new THREE.Vector2();
  const mountRef = useRef<HTMLDivElement>(null);
  const origin = useRef<TerrainHex | undefined>(undefined);
  const pathFinder = useRef<PathCalculator | null>(null);
  const grid = useRef<Grid<TerrainHex> | null>(null);

  // Map tiles
  const Y_TILES = 15;
  const X_TILES = 20;

  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };

  const { color } = getBackgroundColor(props.tile);

  const { mutate: move } = api.travel.move.useMutation({
    onSuccess: (data) => {
      if (userData && target) {
        props.setPosition([data.longitude, data.latitude]);
        userData.longitude = data.longitude;
        userData.latitude = data.latitude;
        origin.current = grid?.current?.getHex({
          col: userData.longitude,
          row: userData.latitude,
        });
        setMoves((prev) => prev + 1);
      }
    },
    onError: (error) => {
      console.error("Error moving user", error);
    },
  });

  useEffect(() => {
    if (target && origin.current && pathFinder.current) {
      const shortestPath = pathFinder.current.getShortestPath(origin.current, target);
      const nextTile = shortestPath?.[1];
      if (nextTile) {
        move({ longitude: nextTile.col, latitude: nextTile.row });
      }
    }
  }, [target, userData, moves, move]);

  useEffect(() => {
    if (mountRef.current && userData) {
      // Mouse move listener
      mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);

      // Used for map size calculations
      const hexagonLengthToWidth = 0.885;
      const stackingDisplacement = 1.31;

      // Map size
      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH * hexagonLengthToWidth;
      const HEXSIZE = (WIDTH / X_TILES / 2) * stackingDisplacement;

      // Seeded noise generator for map gen
      const prng = alea(props.sector + 1);
      const noiseGen = createNoise2D(prng);

      // Defined sector grid
      const Tile = defineHex({
        dimensions: HEXSIZE,
        origin: { x: -HEXSIZE, y: -HEXSIZE },
        orientation: Orientation.FLAT,
      });
      grid.current = new Grid(Tile, rectangle({ width: X_TILES, height: Y_TILES })).map(
        (tile) => {
          const nx = tile.col / X_TILES - 0.5;
          const ny = tile.row / Y_TILES - 0.5;
          tile.level = noiseGen(nx, ny) / 2 + 0.5;
          tile.cost = 1;
          return tile;
        }
      );

      // Setup scene and camara
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, WIDTH, HEIGHT, 0, -100, 100);
      camera.zoom = 1;
      camera.updateProjectionMatrix();

      // Mouse intersections
      let intersected: HexagonalFaceMesh | undefined = undefined;

      // Store current highlights and create a path calculator object
      pathFinder.current = new PathCalculator(grid.current);
      let highlights = new Set<string>();

      // Create a point light (goes in all directions)
      scene.add(new THREE.AmbientLight(0x71abef));
      const pointLight = new THREE.PointLight(0x666666);
      pointLight.position.x = 0;
      pointLight.position.y = 0;
      pointLight.position.z = 200;
      scene.add(pointLight);

      // Renderer the canvas
      const renderer = new THREE.WebGLRenderer({ alpha: true });
      const raycaster = new THREE.Raycaster();
      renderer.setSize(WIDTH, HEIGHT);
      renderer.setClearColor(color, 1);
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
          sprites.map((sprite) => group_assets.add(sprite));

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
          if (tile.row === 1 && tile.col === 1) {
            console.log(tile);
          }
        }
      });

      // Reverse the order of objects in the group_assets
      group_assets.children.sort((a, b) => b.position.y - a.position.y);

      // Add user on map
      if (isInSector) {
        const userMesh = createUserSprite(userData, grid.current);
        group_users.add(userMesh);
      }

      // Enable controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.zoomSpeed = 1.0;
      controls.minZoom = 1;
      controls.maxZoom = 2;
      controls.target.set(0, 0, 0);

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
          setTarget(target);
        }
      };
      renderer.domElement.addEventListener("click", onClick, true);

      // Set the origin
      origin.current = grid?.current?.getHex({
        col: userData.longitude,
        row: userData.latitude,
      });

      // Render the image
      function render() {
        // Update the user position if a path is set
        if (userData) {
          const userMesh = group_users.getObjectByName(userData.userId);
          if (origin.current && userMesh) {
            const { x, y } = origin.current.center;
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
              mesh.material.color.offsetHSL(0, 0, 0.2);
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
      }
      render();

      // Remove the mouseover listener
      return () => {
        mountRef.current?.removeEventListener("mousemove", onDocumentMouseMove);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, []);

  return <div ref={mountRef}></div>;
};

export default Sector;
