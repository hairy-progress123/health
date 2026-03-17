'use client';

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Float, MeshTransmissionMaterial } from '@react-three/drei';
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

function GlassBody() {
    const bodyRef = useRef<THREE.Mesh>(null);
    const texture = useLoader(THREE.TextureLoader, '/anatomy.png');

    useFrame((state) => {
        if (bodyRef.current) {
            bodyRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.3) * 0.15;
            // Add a subtle breathing scale effect
            const scale = 1 + Math.sin(state.clock.getElapsedTime() * 1.5) * 0.02;
            bodyRef.current.scale.set(scale, scale, 1);
        }
    });

    return (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <mesh ref={bodyRef} position={[0, 0, 0]}>
                <planeGeometry args={[2.5, 3.75]} />
                <meshStandardMaterial 
                    map={texture} 
                    transparent={true} 
                    opacity={0.9} 
                    emissiveMap={texture} 
                    emissiveIntensity={0.5} 
                    emissive="#38BDF8"
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            {/* Inner glow ring floating behind the image */}
            <mesh position={[0, 0, -0.5]}>
                <torusGeometry args={[1.2, 0.02, 16, 64]} />
                <meshStandardMaterial color="#0EA5E9" emissive="#0EA5E9" emissiveIntensity={3} transparent opacity={0.5} />
            </mesh>
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

export default function HeroScene() {
    return (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <Canvas camera={{ position: [0, 1, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
                <ambientLight intensity={0.3} />
                <pointLight position={[5, 5, 5]} intensity={1} color="#0EA5E9" />
                <pointLight position={[-5, 3, -5]} intensity={0.5} color="#8B5CF6" />
                <pointLight position={[0, -3, 3]} intensity={0.3} color="#10B981" />
                <Suspense fallback={null}>
                    <GlassBody />
                </Suspense>
                <Particles />
                <Rings />
            </Canvas>
        </div>
    );
}
