"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import AvatarImage from "@/layout/Avatar";
import { Canvas } from "@react-three/fiber";
import {
  useGLTF,
  OrbitControls,
  Stage,
  useProgress,
  Html,
  Gltf,
} from "@react-three/drei";
import { cn } from "src/libs/shadui";

interface Model3dProps {
  modelUrl?: string | null;
  imageUrl?: string | null;
  alt?: string;
  size: number;
  priority?: boolean;
  hover_effect?: boolean;
  className?: string;
}

const Model3d: React.FC<Model3dProps> = (props) => {
  const {
    modelUrl,
    imageUrl,
    alt = "3D Model",
    size,
    priority = false,
    hover_effect = false,
    className,
  } = props;

  const [isLoading, setIsLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prefetch the model
  useEffect(() => {
    const originalCreateImageBitmap = window.createImageBitmap;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.createImageBitmap = undefined;

    if (!modelUrl) {
      setModelError(true);
      setIsLoading(false);
      return;
    }

    // Reset error state if modelUrl is now valid
    setModelError(false);
    setIsLoading(true);

    // Test if the URL is accessible using fetch
    const checkUrl = async () => {
      try {
        if (typeof useGLTF.preload === "function") {
          useGLTF.preload(modelUrl);
        }
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to preload 3D model:", error);
        setModelError(true);
        setIsLoading(false);
      }
    };

    void checkUrl();

    return () => {
      // Restore global to keep the rest of the app functional
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.createImageBitmap = originalCreateImageBitmap;
    };

    // No need for explicit cleanup as the Suspense/useGLTF will handle this
  }, [modelUrl]);

  // Base styling for both 3D and 2D views
  const baseClassName = cn(
    "relative m-auto w-5/6 aspect-square rounded-2xl border-2 border-black",
    hover_effect && "hover:border-amber-500 hover:opacity-80",
    className,
  );

  // Show loader or 2D fallback if model not loaded or has error
  if (!modelUrl || isLoading || modelError) {
    if (!imageUrl) {
      return (
        <div
          className={cn(
            baseClassName,
            "bg-linear-to-r from-slate-500 to-slate-400 background-animate opacity-20",
          )}
        ></div>
      );
    }

    return <AvatarImage href={imageUrl} alt={alt} size={size} priority={priority} />;
  }

  // Render the 3D model with react-three-fiber
  return (
    <div ref={containerRef} className={baseClassName}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <Suspense fallback={<Loader />}>
          <Stage environment="studio" intensity={0.7} preset="soft">
            <Gltf src={modelUrl} />
          </Stage>
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.5}
            makeDefault
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Model3d;

// Loading indicator for 3D model
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-amber-500 font-bold">{progress.toFixed(0)}%</div>
    </Html>
  );
}
