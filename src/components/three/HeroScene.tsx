'use client';

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function Particles({ count = 200 }) {
    const mesh = useRef<THREE.Points>(null);
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 8;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
        }
        return pos;
    }, [count]);

    const colors = useMemo(() => {
        const cols = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            cols[i * 3] = 0.05 + t * 0.1;
            cols[i * 3 + 1] = 0.5 + t * 0.3;
            cols[i * 3 + 2] = 0.8 + t * 0.2;
        }
        return cols;
    }, [count]);

    useFrame((state) => {
        if (mesh.current) {
            mesh.current.rotation.y = state.clock.getElapsedTime() * 0.05;
            mesh.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.03) * 0.1;
        }
    });

    return (
        <points ref={mesh}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                <bufferAttribute attach="attributes-color" args={[colors, 3]} />
            </bufferGeometry>
            <pointsMaterial size={0.03} vertexColors transparent opacity={0.8} sizeAttenuation />
        </points>
    );
}

function GLBModel() {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF('/human_body.glb');

    // Apply glass-like materials to all meshes in the model
    useMemo(() => {
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.material = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color('#0EA5E9'),
                    metalness: 0.1,
                    roughness: 0.1,
                    transmission: 0.92,
                    thickness: 0.5,
                    ior: 1.5,
                    transparent: true,
                    opacity: 0.9,
                    envMapIntensity: 1,
                    side: THREE.DoubleSide,
                });
            }
        });
    }, [scene]);

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.3) * 0.15;
        }
    });

    // Calculate bounding box to center and scale the model
    const { position, scale } = useMemo(() => {
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale model to fit roughly 3 units tall (similar to old GlassBody)
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetHeight = 3.0;
        const s = targetHeight / maxDim;

        return {
            position: new THREE.Vector3(-center.x * s, -center.y * s + 0.7, -center.z * s),
            scale: s,
        };
    }, [scene]);

    return (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <group ref={groupRef} position={[position.x, position.y, position.z]} scale={scale}>
                <primitive object={scene} />
            </group>
        </Float>
    );
}

function Rings() {
    const ring1 = useRef<THREE.Mesh>(null);
    const ring2 = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (ring1.current) {
            ring1.current.rotation.x = t * 0.2;
            ring1.current.rotation.y = t * 0.1;
        }
        if (ring2.current) {
            ring2.current.rotation.x = -t * 0.15;
            ring2.current.rotation.z = t * 0.12;
        }
    });

    return (
        <>
            <mesh ref={ring1} position={[0, 0.7, 0]}>
                <torusGeometry args={[2.0, 0.008, 16, 100]} />
                <meshStandardMaterial color="#0EA5E9" emissive="#0EA5E9" emissiveIntensity={2} transparent opacity={0.3} />
            </mesh>
            <mesh ref={ring2} position={[0, 0.7, 0]}>
                <torusGeometry args={[2.3, 0.006, 16, 100]} />
                <meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={2} transparent opacity={0.2} />
            </mesh>
        </>
    );
}

// Preload the GLB model
useGLTF.preload('/human_body.glb');

export default function HeroScene() {
    return (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <Canvas camera={{ position: [0, 1, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
                <ambientLight intensity={0.3} />
                <pointLight position={[5, 5, 5]} intensity={1} color="#0EA5E9" />
                <pointLight position={[-5, 3, -5]} intensity={0.5} color="#8B5CF6" />
                <pointLight position={[0, -3, 3]} intensity={0.3} color="#10B981" />
                <Suspense fallback={null}>
                    <GLBModel />
                </Suspense>
                <Particles />
                <Rings />
            </Canvas>
        </div>
    );
}
