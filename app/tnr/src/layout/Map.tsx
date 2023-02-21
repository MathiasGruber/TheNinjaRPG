import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { type Village } from "@prisma/client";

type NonEmptyArray<T> = T[] & { 0: T };

interface MapProps {
  highlights?: Village[];
  intersection: boolean;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

interface Tile {
  b: NonEmptyArray<Point>; // boundary
  c: Point; // centerPoint
  w: number; // isWater
}

interface HexagonalFaceMesh extends THREE.Mesh {
  currentHex: number;
  material: THREE.MeshBasicMaterial;
}

interface MapData {
  radius: number;
  tiles: NonEmptyArray<Tile>;
}

const Map: React.FC<MapProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouse = new THREE.Vector2();
  const onDocumentMouseMove = (event: MouseEvent) => {
    if (mountRef.current) {
      const bounding_box = mountRef.current.getBoundingClientRect();
      mouse.x = (event.offsetX - bounding_box.width / 2) / bounding_box.width;
      mouse.y = -(
        (event.offsetY - bounding_box.height / 2) /
        bounding_box.height
      );
    }
  };

  useEffect(() => {
    if (mountRef.current) {
      // Interacivity with mouse
      if (props.intersection) {
        document.addEventListener("mousemove", onDocumentMouseMove, false);
      }
      let intersected: HexagonalFaceMesh | undefined = undefined;

      const WIDTH = mountRef.current.getBoundingClientRect().width;
      const HEIGHT = WIDTH;

      const fov = 75;
      const aspect = WIDTH / HEIGHT;
      const near = 0.5;
      const far = 1000;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
      const raycaster = new THREE.Raycaster(); // create once

      // Materials
      const groundMaterials = [
        new THREE.MeshBasicMaterial({ color: 0x7cfc00, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x397d02, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x77ee00, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x61b329, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x83f52c, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x4cbb17, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x00ee00, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x00aa11, transparent: true }),
      ];

      const oceanMaterial = [
        new THREE.MeshBasicMaterial({ color: 0x2767d7, transparent: true }),
        new THREE.MeshBasicMaterial({ color: 0x1c54b5, transparent: true }),
      ];

      // Renderer the canvas
      const renderer = new THREE.WebGLRenderer({ alpha: true });
      renderer.setSize(WIDTH, HEIGHT);
      renderer.setClearColor(0x000000, 0);
      mountRef.current.appendChild(renderer.domElement);

      // create a point light (goes in all directions)
      scene.add(new THREE.AmbientLight(0x71abef));
      const pointLight = new THREE.PointLight(0x666666);
      // set its position
      pointLight.position.x = 60;
      pointLight.position.y = 50;
      pointLight.position.z = 230;
      scene.add(pointLight);

      // Group to hold the sphere and the line segments.
      const group = new THREE.Group();

      // Spheres from here: https://www.robscanlon.com/hexasphere/
      const fetchData = async () => {
        // Create the map first
        const response = await fetch("map/hexasphere.json");
        const hexasphere = await response
          .json()
          .then((data) => data as MapData);
        for (let i = 0; i < hexasphere.tiles.length; i++) {
          const t = hexasphere.tiles[i];
          if (t) {
            const geometry = new THREE.BufferGeometry();
            const points =
              t.b.length > 5
                ? [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]
                : [0, 1, 2, 0, 2, 3, 0, 3, 4];
            const vertices = new Float32Array(
              points
                .map((p) => t.b[p])
                .flatMap((p) => (p ? [p.x / 3, p.y / 3, p.z / 3] : []))
            );
            geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(vertices, 3)
            );
            const consistentRandom = Math.abs((t.c.x + t.c.y + t.c.z) / 3) / 20;
            console.log(consistentRandom);
            const material =
              t.w === 0
                ? groundMaterials[
                    Math.floor(consistentRandom * groundMaterials.length)
                  ]
                : oceanMaterial[
                    Math.floor(consistentRandom * oceanMaterial.length)
                  ];

            const mesh = new THREE.Mesh(geometry, material?.clone());
            group.add(mesh);
          }
        }

        // Next we add highlights
        const lineColor = "#000000";
        const lineWidth = 1;
        if (props.highlights) {
          // Loop through the highlights
          props.highlights.forEach((highlight) => {
            const sector = hexasphere.tiles[highlight.sector]?.c;
            if (sector) {
              // Create the line
              const points = [];
              points.push(
                new THREE.Vector3(sector.x / 3, sector.y / 3, sector.z / 3)
              );
              points.push(
                new THREE.Vector3(
                  sector.x / 2.5,
                  sector.y / 2.5,
                  sector.z / 2.5
                )
              );
              const lineMaterial = new THREE.LineBasicMaterial({
                color: lineColor,
                linewidth: lineWidth,
              });
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.LineSegments(geometry, lineMaterial);
              group.add(line);
              // Label

              const map = new THREE.TextureLoader().load(
                `villages/${highlight.name}Marker.png`
              );
              const material = new THREE.SpriteMaterial({ map: map });
              const labelSprite = new THREE.Sprite(material);
              // Set position to top of pint
              Object.assign(
                labelSprite.position,
                new THREE.Vector3(
                  sector.x / 2.5,
                  sector.y / 2.5,
                  sector.z / 2.5
                )
              );
              Object.assign(labelSprite.scale, new THREE.Vector3(3, 1, 1));
              group.add(labelSprite);
            }
          });
        }
      };
      void fetchData();

      scene.add(group);

      //Set the camera position
      camera.position.z = 20;

      //Enable controls
      const controls = new TrackballControls(camera, renderer.domElement);
      controls.staticMoving = true;
      // Slow down zooming
      controls.zoomSpeed = 0.1;

      // Spinning camara
      let lastTime = Date.now();
      let cameraAngle = -Math.PI / 1.5;

      //Render the image
      function render() {
        // Intersections with mouse: https://threejs.org/docs/index.html#api/en/core/Raycaster
        if (props.intersection) {
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(scene.children);
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
              intersected.material.color.setHex(0xffff00);
            }
          } // there are no intersections
          else {
            // restore previous intersection object (if it exists) to its original color
            if (intersected) {
              intersected.material.color.setHex(intersected.currentHex);
            }
            // remove previous intersection object reference
            //     by setting current intersection object to "nothing"
            intersected = undefined;
          }
        }

        // Rotate the camara, only if trackball not enabled && highlight not selected
        if (
          controls.up0.x === controls.object.up.x &&
          controls.up0.y === controls.object.up.y &&
          controls.up0.z === controls.object.up.z
        ) {
          const cameraDistance = 10;
          const dt = Date.now() - lastTime;
          const rotateCameraBy = (2 * Math.PI) / (50000 / dt);
          cameraAngle += rotateCameraBy;
          lastTime = Date.now();
          camera.position.x = cameraDistance * Math.cos(cameraAngle);
          camera.position.y = cameraDistance * Math.sin(cameraAngle);
          //camera.position.z = cameraDistance * Math.sin(cameraAngle);
          camera.lookAt(scene.position);
        }

        // Trackball updates
        controls.update();

        // Render the scene
        requestAnimationFrame(render);
        renderer.render(scene, camera);
      }
      render();
    }
    // Remove the intersection listener
    if (props.intersection) {
      return () => {
        document.removeEventListener("mousemove", onDocumentMouseMove);
      };
    }
  }, []);

  return <div ref={mountRef}></div>;
};

export default Map;
