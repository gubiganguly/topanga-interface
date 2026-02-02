"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshDistortMaterial, Sphere, Float, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";

// Component to handle responsive camera adjustments
function ResponsiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    // Adjust camera position based on viewport width
    // Move camera further back on smaller screens
    const isMobile = size.width < 600;
    const isTablet = size.width < 1024 && size.width >= 600;

    if (isMobile) {
      camera.position.z = 7; // Further back for phones
    } else if (isTablet) {
      camera.position.z = 6; // Slightly back for tablets
    } else {
      camera.position.z = 5; // Default for desktop
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

function Creature({ analyser, isListening }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const groupRef = useRef();
  const dataArray = useMemo(() => new Uint8Array(64), []);

  // Animation state
  const [wasListening, setWasListening] = useState(false);
  const [wakeUpTime, setWakeUpTime] = useState(0);
  const smoothedAudio = useRef(0);
  const targetScale = useRef(1);

  // Random movement parameters (for idle state)
  const [targetPos, setTargetPos] = useState(() => new THREE.Vector3(0, 0.5, 0));

  // Detect when listening state changes
  useEffect(() => {
    if (isListening && !wasListening) {
      // Just woke up - record the time for transition animation
      setWakeUpTime(Date.now());
    }
    setWasListening(isListening);
  }, [isListening, wasListening]);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current || !groupRef.current) return;

    const time = state.clock.elapsedTime;

    // Calculate time since wake up for transition
    const timeSinceWakeUp = (Date.now() - wakeUpTime) / 1000;
    const isTransitioning = isListening && timeSinceWakeUp < 1.5;

    let audioLevel = 0;
    if (analyser && isListening) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      audioLevel = sum / dataArray.length;
    }

    // Smooth the audio level for natural pulsation
    smoothedAudio.current = THREE.MathUtils.lerp(smoothedAudio.current, audioLevel, 0.15);
    const smoothAudio = smoothedAudio.current;

    // === SCALE PULSATION ===
    // When listening: pulse between 0.9 and 1.4 based on audio
    // When idle: gentle breathing at scale 1
    if (isListening) {
      const audioPulse = 1 + (smoothAudio / 255) * 0.5;
      // Add a subtle breathing on top
      const breathe = Math.sin(time * 2) * 0.05;
      targetScale.current = audioPulse + breathe;
    } else {
      // Idle breathing animation
      targetScale.current = 1 + Math.sin(time * 1.5) * 0.08;
    }

    // Smooth scale transitions
    const currentScale = meshRef.current.scale.x;
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale.current, 0.12);
    meshRef.current.scale.setScalar(newScale);

    // === DISTORTION / SHAPESHIFTING ===
    // More dramatic distortion when listening
    let targetDistort;
    if (isListening) {
      // Higher base distortion + more audio reactivity for shapeshifting
      targetDistort = 0.5 + (smoothAudio / 255) * 0.7;
      // Add some time-based wobble for organic feel
      targetDistort += Math.sin(time * 3) * 0.1;
    } else {
      // Gentle idle distortion
      targetDistort = 0.3 + Math.sin(time * 2) * 0.1;
    }
    materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.08);

    // === COLOR SHIFTING ===
    const baseColor = new THREE.Color("#8b5cf6"); // Purple
    const activeColor = new THREE.Color("#3b82f6"); // Electric Blue
    const intenseColor = new THREE.Color("#60a5fa"); // Brighter blue for high audio

    let color;
    if (isListening) {
      // Shift more dramatically based on audio
      const intensity = Math.min(smoothAudio / 120, 1);
      color = baseColor.clone().lerp(activeColor, intensity);
      // On high audio, push towards brighter blue
      if (smoothAudio > 100) {
        color.lerp(intenseColor, (smoothAudio - 100) / 155);
      }
    } else {
      color = baseColor.clone();
    }
    materialRef.current.color = color;

    // === ANIMATION SPEED ===
    materialRef.current.speed = isListening ? 3 + (smoothAudio / 255) * 6 : 2;

    // === POSITION: MOVE UP WHEN LISTENING ===
    const listeningPos = new THREE.Vector3(0, 0.6, 0); // Move up when listening

    if (isListening) {
      // When listening, move up with smooth transition
      if (isTransitioning) {
        // Quick move up during wake-up transition
        groupRef.current.position.lerp(listeningPos, 0.08);
      } else {
        // Stay elevated but with subtle audio-reactive movement
        const audioOffset = new THREE.Vector3(
          Math.sin(time * 2) * (smoothAudio / 500),
          Math.cos(time * 1.5) * (smoothAudio / 600),
          0
        );
        groupRef.current.position.lerp(listeningPos.clone().add(audioOffset), 0.05);
      }
    } else {
      // Idle: Organic roaming
      if (time % 5 < 0.02) {
        setTargetPos(new THREE.Vector3(
          (Math.random() - 0.5) * 2.5,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 0.8
        ));
      }
      groupRef.current.position.lerp(targetPos, 0.015);
    }

    // === ROTATION ===
    // More dynamic rotation when listening
    const rotSpeed = isListening ? 0.005 + (smoothAudio / 255) * 0.01 : 0.003;
    meshRef.current.rotation.x += rotSpeed;
    meshRef.current.rotation.y += rotSpeed * 1.2;
  });

  return (
    <group ref={groupRef}>
      <Float
        speed={isListening ? 3 : 2}
        rotationIntensity={isListening ? 0.5 : 1}
        floatIntensity={isListening ? 1 : 2}
      >
        <Sphere ref={meshRef} args={[1, 64, 64]} position={[0, 0, 0]}>
          <MeshDistortMaterial
            ref={materialRef}
            color="#8b5cf6"
            envMapIntensity={0.5}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.15}
            roughness={0.1}
          />
        </Sphere>
      </Float>
    </group>
  );
}

function ReactiveLight({ analyser, isListening, position, baseColor, baseIntensity }) {
  const lightRef = useRef();
  const dataArray = useMemo(() => new Uint8Array(64), []);

  useFrame(() => {
    if (!lightRef.current) return;

    let audioLevel = 0;
    if (analyser && isListening) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      audioLevel = sum / dataArray.length;
    }

    // Pulse light intensity with audio
    const targetIntensity = isListening
      ? baseIntensity + (audioLevel / 255) * 1.5
      : baseIntensity;
    lightRef.current.intensity = THREE.MathUtils.lerp(
      lightRef.current.intensity,
      targetIntensity,
      0.1
    );
  });

  return <pointLight ref={lightRef} position={position} intensity={baseIntensity} color={baseColor} />;
}

export default function Scene3D({ analyser, isListening }) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <ResponsiveCamera />
      <ambientLight intensity={isListening ? 0.6 : 0.5} />
      <ReactiveLight
        analyser={analyser}
        isListening={isListening}
        position={[10, 10, 10]}
        baseColor="#a78bfa"
        baseIntensity={1}
      />
      <ReactiveLight
        analyser={analyser}
        isListening={isListening}
        position={[-10, -10, -10]}
        baseColor="#3b82f6"
        baseIntensity={0.5}
      />

      <Creature analyser={analyser} isListening={isListening} />

      <Sparkles
        count={isListening ? 80 : 50}
        scale={6}
        size={isListening ? 3 : 2}
        speed={isListening ? 0.8 : 0.4}
        opacity={isListening ? 0.7 : 0.5}
        color="#fff"
      />
      <Stars
        radius={100}
        depth={50}
        count={1000}
        factor={4}
        saturation={0}
        fade
        speed={isListening ? 2 : 1}
      />
    </Canvas>
  );
}
