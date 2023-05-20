import { useEffect, useRef, useState } from "react";
import {
  Vector2,
  Vector3,
  LineBasicMaterial,
  LineSegments,
  TextureLoader,
  PerspectiveCamera,
  SpriteMaterial,
  Sprite,
  Group,
  BufferGeometry,
  BufferAttribute,
  Mesh,
} from "three";
import alea from "alea";
import * as TWEEN from "@tweenjs/tween.js";
// import Stats from "three/examples/jsm/libs/stats.module";

import { type Village } from "@prisma/client";
import {
  type GlobalTile,
  type GlobalMapData,
  type GlobalPoint,
  type HexagonalFaceMesh,
} from "../libs/travel/types";
import { cleanUp, setupScene } from "../libs/travel/util";
import { groundMats, oceanMats, dessertMats } from "../libs/travel/biome";
import { TrackballControls } from "../libs/travel/TrackBallControls";
import { useUserData } from "../utils/UserContext";

interface MapProps {
  highlights?: Village[];
  userLocation?: boolean;
  intersection: boolean;
  hexasphere: GlobalMapData;
  onTileClick?: (sector: number | null, tile: GlobalTile | null) => void;
  onTileHover?: (sector: number | null, tile: GlobalTile | null) => void;
}

const Map: React.FC<MapProps> = (props) => {
  const { data: userData } = useUserData();
  const [hoverSector, setHoverSector] = useState<number | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mouse = new Vector2();
  const { hexasphere } = props;

  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX / bounding_box.width) * 2 - 1;
      mouse.y = -((event.offsetY / bounding_box.height) * 2 - 1);
    }
  };

  useEffect(() => {
    if (mountRef.current) {
      // Performance stats
      // const stats = new Stats();
      // document.body.appendChild(stats.dom);

      // Interacivity with mouse
      if (props.intersection) {
        mountRef.current.addEventListener("mousemove", onDocumentMouseMove, false);
      }
      let intersected: HexagonalFaceMesh | undefined = undefined;

      const WIDTH = mountRef.current.getBoundingClientRect().width;
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
      mountRef.current.appendChild(renderer.domElement);

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
              .flatMap((p) => (p ? [p.x / 3, p.y / 3, p.z / 3] : []))
          );
          geometry.setAttribute("position", new BufferAttribute(vertices, 3));
          const consistentRandom = prng();
          let material = null;
          if (t.t === 0) {
            material = oceanMats[Math.floor(consistentRandom * oceanMats.length)];
          } else if (t.t === 1) {
            material = groundMats[Math.floor(consistentRandom * groundMats.length)];
          } else {
            material = dessertMats[Math.floor(consistentRandom * dessertMats.length)];
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
            const map = new TextureLoader().load(
              `/villages/${highlight.name}Marker.png`
            );
            const material = new SpriteMaterial({ map: map });
            const labelSprite = new Sprite(material);

            // Set position to top of pin
            Object.assign(
              labelSprite.position,
              new Vector3(sector.x / 2.5, sector.y / 2.5, sector.z / 2.5)
            );
            Object.assign(labelSprite.scale, new Vector3(3, 1, 1));
            group_highlights.add(labelSprite);
          }
        });
      }
      scene.add(group_highlights);
      scene.add(group_tiles);

      // Add user label
      const userLocation = { h: 0.9, c: 0, l: 0.7 };
      if (props.userLocation && userData) {
        const mesh = group_tiles.getObjectByName(`${userData.sector}`);
        if (mesh) {
          (mesh as HexagonalFaceMesh).material.color.setHex(0x00ffd8);
          new TWEEN.Tween(userLocation)
            .to({ h: 0.9, c: 1, l: 0.8 }, 100)
            .yoyo(true)
            .repeat(Infinity)
            .easing(TWEEN.Easing.Cubic.InOut)
            .start();
        }
      }

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
        if (userLocation && userData) {
          const mesh = group_tiles.getObjectByName(`${userData.sector}`);
          (mesh as HexagonalFaceMesh).material.color.setHSL(
            userLocation.h,
            userLocation.c,
            userLocation.l
          );
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
        renderer.render(scene, camera);

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
        mountRef.current?.removeChild(renderer.domElement);
        cleanUp(scene, renderer);
        cancelAnimationFrame(animationId);
      };
    }
  }, [props.highlights, props.intersection]);

  return (
    <>
      <div ref={mountRef}></div>
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
