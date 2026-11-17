// WebRTC hook — race-free signaling with separate Redis keys
// TURN credentials fetched from /api/turn with reliable fallback
// Each signal type has its own key to prevent read-modify-write races

import { useRef, useCallback, useEffect, useState } from 'react';
import { cloudGet, cloudSet } from '@/lib/shared-store';

// ── ICE Config ──────────────────────────────────────────────

const FALLBACK: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
    ],
    iceCandidatePoolSize: 10,
};

async function getIceConfig(): Promise<RTCConfiguration> {
    try {
        const r = await fetch('/api/turn', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            if (d.iceServers && d.iceServers.length > 0) {
                return { iceServers: d.iceServers, iceCandidatePoolSize: 10 };
            }
        }
    } catch { /* fallback */ }
    return FALLBACK;
}

// ── Signaling types & keys ───────────────────────────────────

type IceEntry = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
type SdpEntry = { type: string; sdp: string };

const KEY = {
    offer: (id: string) => `rtc_offer_${id}`,
    answer: (id: string) => `rtc_answer_${id}`,
    callerIce: (id: string) => `rtc_cice_${id}`,
    calleeIce: (id: string) => `rtc_eice_${id}`,
};

async function sigSet(key: string, val: unknown) {
    await cloudSet(key, val);
}
async function sigGet<T>(key: string): Promise<T | null> {
    try { return await cloudGet<T>(key); } catch { return null; }
}

// ── Media helper ────────────────────────────────────────────

async function getMedia(type: 'audio' | 'video'): Promise<MediaStream> {
    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: type === 'video'
                ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
                : false,
        });
    } catch (err: unknown) {
        const e = err as Error;
        if (type === 'video' && e.name === 'NotFoundError') {
            try {
                // Fallback to audio-only if webcam hardware is missing
                return await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false,
                });
            } catch { /* proceed to throw */ }
        }
        if (e.name === 'NotAllowedError')
            throw new Error('Please allow ' + (type === 'video' ? 'camera and microphone' : 'microphone') + ' access in your browser settings');
        if (e.name === 'NotFoundError')
            throw new Error('No ' + (type === 'video' ? 'camera/' : '') + 'microphone found on this device');
        throw new Error('Could not access media: ' + e.message);
    }
}

// ── Hook ────────────────────────────────────────────────────

export function useWebRTC() {
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteMediaStreamRef = useRef<MediaStream | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Call tracking refs to prevent re-entrant teardown loops
    const activeCallIdRef = useRef<string | null>(null);
    const isStartingRef = useRef(false);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);

    // ── Dedicated audio element for playing remote audio ──
    useEffect(() => {
        if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
        if (!audioRef.current) {
            const a = document.createElement('audio');
            a.autoplay = true;
            a.setAttribute('playsinline', '');
            a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
            document.body.appendChild(a);
            audioRef.current = a;
        }
        audioRef.current.srcObject = remoteStream;
        audioRef.current.play().catch(() => {
            setTimeout(() => audioRef.current?.play().catch(() => { }), 500);
        });
    }, [remoteStream]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cleanupAll();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cleanupAll = () => {
        activeCallIdRef.current = null;
        isStartingRef.current = false;

        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        if (remoteMediaStreamRef.current) {
            remoteMediaStreamRef.current.getTracks().forEach(t => t.stop());
            remoteMediaStreamRef.current = null;
        }

        if (pcRef.current) {
            try { pcRef.current.close(); } catch { }
            pcRef.current = null;
        }

        if (audioRef.current) {
            try {
                audioRef.current.pause();
                audioRef.current.srcObject = null;
                audioRef.current.remove();
            } catch { }
            audioRef.current = null;
        }
    };

    const cleanup = useCallback(() => {
        cleanupAll();
        setLocalStream(null);
        setRemoteStream(null);
        setIsConnected(false);
        setPermissionError(null);
    }, []);

    // ── Shared peer-connection setup ──
    const setupPC = (config: RTCConfiguration, stream: MediaStream) => {
        const pc = new RTCPeerConnection(config);
        pcRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // Persistent remote media stream container
        const streamContainer = new MediaStream();
        remoteMediaStreamRef.current = streamContainer;

        pc.ontrack = (e) => {
            console.log('[WebRTC] ontrack received:', e.track.kind, e.track.id);
            if (!mountedRef.current) return;

            // Mark connected since media is arriving
            setIsConnected(true);

            // Accumulate track if not already in container
            if (!streamContainer.getTracks().some(t => t.id === e.track.id)) {
                streamContainer.addTrack(e.track);
            }

            // Provide new MediaStream instance so React components re-render with updated tracks
            const newStream = new MediaStream(streamContainer.getTracks());
            setRemoteStream(newStream);

            if (e.track.kind === 'audio' && audioRef.current) {
                audioRef.current.srcObject = newStream;
                audioRef.current.play().catch(err => console.log('Audio autoplay blocked:', err));
            }

            e.track.onunmute = () => {
                console.log('[WebRTC] track onunmute:', e.track.kind);
                if (mountedRef.current) {
                    setRemoteStream(new MediaStream(streamContainer.getTracks()));
                    if (e.track.kind === 'audio' && audioRef.current) {
                        audioRef.current.play().catch(() => { });
                    }
                }
            };
        };

        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            console.log('[WebRTC] connectionState:', s, 'iceState:', pc.iceConnectionState);
            if (mountedRef.current) {
                if (s === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    setIsConnected(true);
                } else if (s === 'failed' || s === 'closed') {
                    setIsConnected(false);
                }
            }
            if (s === 'failed') {
                console.warn('[WebRTC] Connection failed, attempting ICE restart');
                try { pc.restartIce(); } catch { }
            }
        };

        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            console.log('[WebRTC] iceConnectionState:', s);
            if (mountedRef.current) {
                if (s === 'connected' || s === 'completed' || pc.connectionState === 'connected') {
                    setIsConnected(true);
                } else if (s === 'failed') {
                    setIsConnected(false);
                }
            }
        };

        return pc;
    };

    // ── Safe ICE Pusher (writes accumulated local candidates without read races) ──
    const createIcePusher = (key: string) => {
        const allCandidates: IceEntry[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        let isFlushing = false;
        let pendingFlush = false;

        const doFlush = async () => {
            if (!mountedRef.current || allCandidates.length === 0) return;
            isFlushing = true;
            try {
                await sigSet(key, [...allCandidates]);
            } catch (e) {
                console.error('[WebRTC] Failed to save ICE candidates:', e);
            } finally {
                isFlushing = false;
                if (pendingFlush) {
                    pendingFlush = false;
                    scheduleFlush(100);
                }
            }
        };

        const scheduleFlush = (delay = 200) => {
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = setTimeout(() => {
                flushTimer = null;
                if (isFlushing) {
                    pendingFlush = true;
                } else {
                    doFlush();
                }
            }, delay);
        };

        return {
            push: (c: RTCIceCandidate) => {
                allCandidates.push({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex });
                scheduleFlush(200);
            },
            flush: () => {
                if (flushTimer) clearTimeout(flushTimer);
                doFlush();
            },
        };
    };

    // ── Safe ICE Candidate Applicator ──
    const applyIceCandidates = async (pc: RTCPeerConnection, candidates: IceEntry[], appliedSet: Set<string>) => {
        if (!pc.remoteDescription || !pc.localDescription) {
            // Cannot add candidates until signaling state is stable with both descriptions set
            return;
        }
        for (const c of candidates) {
            if (!c.candidate || appliedSet.has(c.candidate)) continue;
            try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
                appliedSet.add(c.candidate);
            } catch {
                // If temporary error, leave unadded so next poll will retry
            }
        }
    };

    // ═══════════ CALLER (Doctor) ═══════════
    const startAsCallerAsync = useCallback(async (callId: string, callType: 'audio' | 'video' = 'audio') => {
        if (activeCallIdRef.current === callId && (isStartingRef.current || pcRef.current)) {
            console.log('[WebRTC] Caller already initialized for call', callId);
            return;
        }

        cleanup();
        activeCallIdRef.current = callId;
        isStartingRef.current = true;
        setPermissionError(null);

        try {
            // Parallel: get media + TURN config
            const [stream, config] = await Promise.all([
                getMedia(callType).catch((e: Error) => { setPermissionError(e.message); throw e; }),
                getIceConfig(),
            ]);

            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = setupPC(config, stream);

            // ICE candidate pusher → writes to caller ICE key
            const icePusher = createIcePusher(KEY.callerIce(callId));
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    icePusher.push(e.candidate);
                } else {
                    icePusher.flush();
                }
            };

            // Create and send offer
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: callType === 'video',
            });
            await pc.setLocalDescription(offer);
            await sigSet(KEY.offer(callId), { type: offer.type, sdp: offer.sdp || '' });

            isStartingRef.current = false;

            // Poll for Callee's Answer and Callee ICE candidates
            let answerApplied = false;
            const appliedCalleeIce = new Set<string>();

            pollRef.current = setInterval(async () => {
                if (!mountedRef.current || !pcRef.current || pcRef.current.connectionState === 'closed') {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    return;
                }
                const p = pcRef.current;

                // 1. Check for answer
                if (!answerApplied) {
                    const ans = await sigGet<SdpEntry>(KEY.answer(callId));
                    if (ans && p.signalingState === 'have-local-offer') {
                        try {
                            await p.setRemoteDescription(new RTCSessionDescription({ type: ans.type as RTCSdpType, sdp: ans.sdp }));
                            answerApplied = true;
                            icePusher.flush();
                        } catch (e) {
                            console.error('[WebRTC] Failed to set remote answer:', e);
                        }
                    }
                }

                // 2. Once answer is applied, apply any Callee ICE candidates
                if (answerApplied && p.remoteDescription && p.localDescription) {
                    const calleeIce = await sigGet<IceEntry[]>(KEY.calleeIce(callId));
                    if (calleeIce && calleeIce.length > 0) {
                        await applyIceCandidates(p, calleeIce, appliedCalleeIce);
                    }
                }
            }, 500);

        } catch (e) {
            isStartingRef.current = false;
            throw e;
        }
    }, [cleanup]);

    // ═══════════ CALLEE (Patient) ═══════════
    const startAsCalleeAsync = useCallback(async (callId: string, callType: 'audio' | 'video' = 'audio') => {
        if (activeCallIdRef.current === callId && (isStartingRef.current || pcRef.current)) {
            console.log('[WebRTC] Callee already initialized for call', callId);
            return;
        }

        cleanup();
        activeCallIdRef.current = callId;
        isStartingRef.current = true;
        setPermissionError(null);

        try {
            // Parallel: fetch offer + get media + TURN config
            const [offerData, stream, config] = await Promise.all([
                (async () => {
                    for (let i = 0; i < 10; i++) {
                        const o = await sigGet<SdpEntry>(KEY.offer(callId));
                        if (o) return o;
                        await new Promise(r => setTimeout(r, 400));
                    }
                    return null;
                })(),
                getMedia(callType).catch((e: Error) => { setPermissionError(e.message); throw e; }),
                getIceConfig(),
            ]);

            if (!offerData) {
                setPermissionError('Could not find call signal. Please try again.');
                stream.getTracks().forEach(t => t.stop());
                isStartingRef.current = false;
                return;
            }

            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = setupPC(config, stream);

            // ICE candidate pusher → writes to callee ICE key
            const icePusher = createIcePusher(KEY.calleeIce(callId));
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    icePusher.push(e.candidate);
                } else {
                    icePusher.flush();
                }
            };

            // 1. Set remote offer
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: offerData.type as RTCSdpType,
                sdp: offerData.sdp,
            }));

            // 2. Create and set local answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sigSet(KEY.answer(callId), { type: answer.type, sdp: answer.sdp || '' });

            isStartingRef.current = false;
            icePusher.flush();

            // 3. Now that BOTH descriptions are set, safely apply any Caller ICE candidates
            const appliedCallerIce = new Set<string>();
            const initialCallerIce = await sigGet<IceEntry[]>(KEY.callerIce(callId));
            if (initialCallerIce && initialCallerIce.length > 0) {
                await applyIceCandidates(pc, initialCallerIce, appliedCallerIce);
            }

            // 4. Poll for additional Caller ICE candidates (500ms interval)
            pollRef.current = setInterval(async () => {
                if (!mountedRef.current || !pcRef.current || pcRef.current.connectionState === 'closed') {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    return;
                }
                const p = pcRef.current;
                const latestCallerIce = await sigGet<IceEntry[]>(KEY.callerIce(callId));
                if (latestCallerIce && latestCallerIce.length > 0) {
                    await applyIceCandidates(p, latestCallerIce, appliedCallerIce);
                }
            }, 500);

        } catch (e) {
            isStartingRef.current = false;
            throw e;
        }
    }, [cleanup]);

    // ── Controls ──
    const toggleMute = useCallback((muted: boolean) => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    }, []);

    const toggleCamera = useCallback((off: boolean) => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !off; });
    }, []);

    const stopCall = useCallback(() => cleanup(), [cleanup]);

    return {
        startAsCallerAsync, startAsCalleeAsync,
        toggleMute, toggleCamera, stopCall, cleanup,
        localStream, remoteStream, isConnected, permissionError,
    };
}
