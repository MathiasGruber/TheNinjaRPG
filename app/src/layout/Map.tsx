import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  TorusKnotGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three";
import WebGlError from "@/layout/WebGLError";
import alea from "alea";
import * as TWEEN from "@tweenjs/tween.js";
import { createTexture } from "@/libs/threejs/util";
import { cleanUp, setupScene } from "@/libs/travel/util";
import { groundMats, oceanMats, dessertMats, iceMats } from "@/libs/travel/biome";
import { TrackballControls } from "@/libs/threejs/TrackBallControls";
import { useUserData } from "@/utils/UserContext";
import type { Village } from "../../drizzle/schema";
import type { GlobalTile } from "@/libs/travel/types";
import type { GlobalMapData } from "@/libs/travel/types";
import type { GlobalPoint } from "@/libs/travel/types";
import type { HexagonalFaceMesh } from "@/libs/hexgrid";

interface MapProps {
  highlights?: Village[];
  userLocation?: boolean;
  highlightedSector?: number;
  intersection: boolean;
  hexasphere: GlobalMapData;
  onTileClick?: (sector: number | null, tile: GlobalTile | null) => void;
  onTileHover?: (sector: number | null, tile: GlobalTile | null) => void;
}

const Map: React.FC<MapProps> = (props) => {
  const { data: userData } = useUserData();
  const [webglError, setWebglError] = useState<boolean>(false);
  const [hoverSector, setHoverSector] = useState<number | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mouse = new Vector2();
  const { hexasphere, highlightedSector } = props;

  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };

  useEffect(() => {
    // Reference to the mount
    const sceneRef = mountRef.current;
    if (sceneRef) {
      // Performance stats
      // const stats = new Stats();
      // document.body.appendChild(stats.dom);

      // Interacivity with mouse
      if (props.intersection) {
        sceneRef.addEventListener("mousemove", onDocumentMouseMove, false);
      }
      let intersected: HexagonalFaceMesh | undefined = undefined;

      const WIDTH = sceneRef.getBoundingClientRect().width;
      const HEIGHT = WIDTH;

      const fov = 75;
      const aspect = WIDTH / HEIGHT;
      const near = 0.5;
      const far = 1000;

      // Setup scene, renderer and raycaster
      const { scene, renderer, raycaster, handleResize } = setupScene({
        mountRef: mountRef,
        width: WIDTH,
        height: HEIGHT,
        sortObjects: false,
        color: 0x000000,
        colorAlpha: 0,
        width2height: 1,
      });

      // If no renderer, then we have an error with the browser, let the user know
      if (!renderer) {
        setWebglError(true);
        return;
      }

      // Create scene
      sceneRef.appendChild(renderer.domElement);

      // Setup camera
      const camera = new PerspectiveCamera(fov, aspect, near, far);

      // Random number gen
      const prng = alea(42);

      // Groups to hold items
      const group_tiles = new Group();
      const group_highlights = new Group();

      // Add on double click tile handler
      if (props.intersection && props.onTileClick) {
        const onClick = () => {
          const intersects = raycaster.intersectObjects(group_tiles.children);
          if (intersects.length > 0) {
            const sector = intersects?.[0]?.object?.userData?.id as number;
            const tile = hexasphere?.tiles[sector];
            if (tile !== undefined) {
              props.onTileClick?.(sector, tile);
            }
          }
        };
        renderer.domElement.addEventListener("dblclick", onClick, true);
      }

      // Spheres from here: https://www.robscanlon.com/hexasphere/
      // Create the map first
      for (let i = 0; i < hexasphere.tiles.length; i++) {
        const t = hexasphere.tiles[i];
        if (t) {
          const geometry = new BufferGeometry();
          const points =
            t.b.length > 5
              ? [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]
              : [0, 1, 2, 0, 2, 3, 0, 3, 4];
          const vertices = new Float32Array(
            points
              .map((p) => t.b[p])
              .flatMap((p) => (p ? [p.x / 3, p.y / 3, p.z / 3] : [])),
          );
          geometry.setAttribute("position", new BufferAttribute(vertices, 3));
          const consistentRandom = prng();
          let material = null;
          if (t.t === 0) {
            material = oceanMats[Math.floor(consistentRandom * oceanMats.length)];
          } else if (t.t === 1) {
            material = groundMats[Math.floor(consistentRandom * groundMats.length)];
          } else if (t.t === 2) {
            material = dessertMats[Math.floor(consistentRandom * dessertMats.length)];
          } else {
            material = iceMats[Math.floor(consistentRandom * iceMats.length)];
          }
          const mesh = new Mesh(geometry, material?.clone());
          mesh.matrixAutoUpdate = false;
          mesh.userData.id = i;
          mesh.name = `${i}`;
          group_tiles.add(mesh);
        }
      }

      // Next we add highlights
      const lineColor = "#000000";
      const lineWidth = 1;
      if (props.highlights) {
        // Loop through the highlights
        props.highlights.forEach((highlight) => {
          const sector = hexasphere?.tiles[highlight.sector]?.c;
          if (sector) {
            // Create the line
            const points = [];
            points.push(new Vector3(sector.x / 3, sector.y / 3, sector.z / 3));
            points.push(new Vector3(sector.x / 2.5, sector.y / 2.5, sector.z / 2.5));
            const lineMaterial = new LineBasicMaterial({
              color: lineColor,
              linewidth: lineWidth,
            });
            const geometry = new BufferGeometry().setFromPoints(points);
            const line = new LineSegments(geometry, lineMaterial);
            group_highlights.add(line);
            // Label
            const canvas = document.createElement("canvas");
            const [w, h, r, f] = [100, 40, 4, 42 - highlight.name.length * 2];
            canvas.width = w;
            canvas.height = h;
            const context = canvas.getContext("2d");
            if (context) {
              context.globalAlpha = 0.9;
              context.fillStyle = highlight.hexColor;
              context.lineWidth = 4;
              context.strokeStyle = "black";
              context.roundRect(r / 2, r / 2, w - r, h - r, r);
              context.stroke();
              context.fill();
              context.globalAlpha = 1.0;
              context.textAlign = "center";
              context.textBaseline = "middle";
              context.fillStyle = "black";
              context.strokeStyle = "#F0F0F0";
              context.font = `${f}px arial narrow`;
              context.strokeText(highlight.mapName || highlight.name, w / 2, h / 2);
              context.fillText(highlight.mapName || highlight.name, w / 2, h / 2);
            }
            const texture = createTexture(canvas);
            texture.generateMipmaps = false;
            texture.minFilter = LinearFilter;
            texture.needsUpdate = true;
            const bar_material = new SpriteMaterial({ map: texture });
            const labelSprite = new Sprite(bar_material);
            labelSprite.scale.set(canvas.width / 40, canvas.height / 40, 1);
            labelSprite.position.set(sector.x / 2.5, sector.y / 2.5, sector.z / 2.5);
            group_highlights.add(labelSprite);
          }
        });
      }

      scene.add(group_highlights);
      scene.add(group_tiles);

      // Add tweening highlights
      const userTweenColor = { r: 1.0, g: 0.0, b: 0.0 };
      const questTweenColor = { r: 0.8, g: 0.6, b: 0.0 };
      const highlightTweenColor = { r: 0.0, g: 0.6, b: 0.8 };
      const sectorsToHighlight: { sector: number; color: typeof userTweenColor }[] = [];
      if (props.userLocation && userData) {
        sectorsToHighlight.push({ sector: userData.sector, color: userTweenColor });
        if (highlightedSector) {
          sectorsToHighlight.push({
            sector: highlightedSector,
            color: highlightTweenColor,
          });
        }
        userData.userQuests.forEach((userquest) => {
          userquest.quest.content.objectives.forEach((objective) => {
            if ("sector" in objective && objective.sector && !objective.hideLocation) {
              sectorsToHighlight.push({
                sector: objective.sector,
                color: questTweenColor,
              });
            }
          });
        });
        new TWEEN.Tween(userTweenColor)
          .to({ r: 0.0, g: 0.0, b: 0.0 }, 1000)
          .repeat(Infinity)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start();
        new TWEEN.Tween(questTweenColor)
          .to({ r: 0.0, g: 0.0, b: 0.0 }, 1000)
          .repeat(Infinity)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start();
        new TWEEN.Tween(highlightTweenColor)
          .to({ r: 0.0, g: 0.0, b: 0.0 }, 1000)
          .repeat(Infinity)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start();
      }

      // Highlighted GPS pins for user, quests, and sector search
      sectorsToHighlight.forEach((highlight) => {
        const hasLabel = props.highlights?.find((h) => h.sector === highlight.sector);
        const sector = hexasphere?.tiles[highlight.sector]?.c;
        if (!hasLabel && sector) {
          // Create the line
          const points = [];
          points.push(new Vector3(sector.x / 3, sector.y / 3, sector.z / 3));
          points.push(new Vector3(sector.x / 2.5, sector.y / 2.5, sector.z / 2.5));
          const lineMaterial = new LineBasicMaterial({
            color: lineColor,
            linewidth: lineWidth,
          });
          const geometry = new BufferGeometry().setFromPoints(points);
          const line = new LineSegments(geometry, lineMaterial);
          group_highlights.add(line);
          // Object
          const highlightMaterial = new MeshBasicMaterial({
            color: new Color(highlight.color.r, highlight.color.g, highlight.color.b),
          });
          const highlightGeom = new TorusKnotGeometry(10, 3, 70, 8);
          const highlightMesh = new Mesh(highlightGeom, highlightMaterial);
          highlightMesh.position.set(sector.x / 2.5, sector.y / 2.5, sector.z / 2.5);
          highlightMesh.scale.set(0.05, 0.05, 0.05);
          highlightMesh.name = `highlight_sphere`;
          group_highlights.add(highlightMesh);
          // Edges
          const edges = new EdgesGeometry(highlightGeom);
          const lines = new LineSegments(
            edges,
            new LineBasicMaterial({ color: lineColor, linewidth: lineWidth }),
          );
          Object.assign(lines.position, highlightMesh.position);
          Object.assign(lines.scale, highlightMesh.scale);
          group_highlights.add(lines);
        }
      });

      //Enable controls
      const controls = new TrackballControls(camera, renderer.domElement);
      controls.noPan = true;
      controls.staticMoving = true;
      controls.zoomSpeed = 0.1;
      const cameraDistance = 22;
      let lastTime = Date.now();
      let sigma = 0;
      let phi = 0;

      // Initial camera positioning
      if (props.userLocation && userData) {
        const sector = hexasphere?.tiles[userData.sector]?.c;
        if (sector) {
          const { x, y, z } = sector;
          sigma = Math.atan2(y, x);
          phi = Math.acos(z / Math.sqrt(x * x + y * y + z * z));
        }
      }

      // Render the image
      let animationId = 0;
      function render() {
        if (userTweenColor && userData && sectorsToHighlight.length > 0) {
          sectorsToHighlight.forEach((highlight) => {
            const mesh = group_tiles.getObjectByName(`${highlight.sector}`);
            if (mesh) {
              if (userData.sector === highlight.sector) {
                (mesh as HexagonalFaceMesh).material.color.setRGB(
                  userTweenColor.r,
                  userTweenColor.g,
                  userTweenColor.b,
                );
              } else if (highlightedSector === highlight.sector) {
                (mesh as HexagonalFaceMesh).material.color.setRGB(
                  highlightTweenColor.r,
                  highlightTweenColor.g,
                  highlightTweenColor.b,
                );
              } else {
                (mesh as HexagonalFaceMesh).material.color.setRGB(
                  questTweenColor.r,
                  questTweenColor.g,
                  questTweenColor.b,
                );
              }
            }
          });
          TWEEN.update();
        }
        // Intersections with mouse: https://threejs.org/docs/index.html#api/en/core/Raycaster
        if (props.intersection) {
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(group_tiles.children);
          if (intersects.length > 0) {
            // if the closest object intersected is not the currently stored intersection object
            if (intersects[0] && intersects[0].object != intersected) {
              // restore previous intersection object (if it exists) to its original color
              if (intersected) {
                intersected.material.color.setHex(intersected.currentHex);
              }
              // store reference to closest object as current intersection object
              intersected = intersects[0].object as HexagonalFaceMesh;
              // store color of closest object (for later restoration)
              intersected.currentHex = intersected.material.color.getHex();
              // set a new color for closest object
              intersected.material.color.setHex(0x00ffd8);
              // Call outside stuff
              const sector = intersected.userData.id;
              if (props.onTileHover) {
                const tile = hexasphere?.tiles[sector];
                if (tile) props.onTileHover(sector, tile);
              }
              setHoverSector(sector);
            }
          } else {
            if (intersected) {
              intersected.material.color.setHex(intersected.currentHex);
            }
            intersected = undefined;
          }
        }

        // Rotate the camara, only if trackball not enabled && highlight not selected
        const current = controls.up0 as GlobalPoint;
        const previous = controls?.object as { up: GlobalPoint };
        if (
          current.x === previous.up.x &&
          current.y === previous.up.y &&
          current.z === previous.up.z
        ) {
          const dt = Date.now() - lastTime;
          const rotateCameraBy = (1 * Math.PI) / (50000 / dt);
          phi += rotateCameraBy;
          lastTime = Date.now();
          camera.position.x = cameraDistance * Math.sin(phi) * Math.cos(sigma);
          camera.position.y = cameraDistance * Math.sin(phi) * Math.sin(sigma);
          camera.position.z = cameraDistance * Math.cos(phi);
          camera.lookAt(scene.position);
        }

        // Trackball updates
        controls.update();

        // Render the scene
        animationId = requestAnimationFrame(render);
        renderer?.render(scene, camera);

        // Performance monitor
        // stats.update();
      }
      render();

      // Remove the intersection listener

      return () => {
        if (props.intersection) {
          document.removeEventListener("mousemove", onDocumentMouseMove);
        }
        window.removeEventListener("resize", handleResize);
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
        if (sceneRef.contains(renderer.domElement)) {
          sceneRef.removeChild(renderer.domElement);
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.highlights, props.intersection, highlightedSector]);

  return (
    <>
      <div ref={mountRef}></div>
      {webglError && <WebGlError />}
      <div className="absolute left-0 top-0 m-5">
        <ul>
          {hoverSector && (
            <>
              <li className="flex flex-row items-center">
                <span className="text-2xl mr-1 animate-pulse text-red-500">⬢</span> You
              </li>
              <li className="flex flex-row items-center">
                <span className="text-2xl mr-1 animate-pulse text-orange-500">⬢</span>{" "}
                Quest
              </li>
              {highlightedSector && (
                <li className="flex flex-row items-center">
                  <span className="text-2xl mr-1 animate-pulse text-teal-500">⬢</span>{" "}
                  Highlight
                </li>
              )}
            </>
          )}
        </ul>
      </div>
      <div className="absolute right-0 top-0 m-5">
        <ul>
          {hoverSector && (
            <>
              <li>- Highlighting sector {hoverSector}</li>
              <li>- Double click tile to move there</li>
            </>
          )}
        </ul>
      </div>
    </>
  );
};

export default Map;
