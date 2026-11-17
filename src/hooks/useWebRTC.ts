// WebRTC hook — race-free signaling with separate Redis keys
// Uses max-bundle so audio & video share one ICE transport (identical to audio calls)
// TURN credentials fetched from /api/turn with reliable fallback

import { useRef, useCallback, useEffect, useState } from 'react';
import { cloudGet, cloudSet } from '@/lib/shared-store';

// ── ICE Config ──────────────────────────────────────────────

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:stun.l.google.com:19302' },
    {
        urls: 'turn:global.relay.metered.ca:80',
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
];

async function getIceConfig(): Promise<RTCConfiguration> {
    let iceServers = FALLBACK_ICE_SERVERS;
    try {
        const r = await fetch('/api/turn', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            if (d.iceServers && d.iceServers.length > 0) {
                iceServers = d.iceServers;
            }
        }
    } catch { /* use fallback */ }

    return {
        iceServers,
        // Force audio and video onto a single bundled ICE/DTLS transport (same as audio-only calls)
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
    };
}

// ── Signaling types & keys ───────────────────────────────────

type IceEntry = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
type SdpEntry = { type: string; sdp: string };

const KEY = {
    offer: (id: string) => `rtc_offer_${id}`,
    answer: (id: string) => `rtc_answer_${id}`,
    callerIce: (id: string) => `rtc_cice_${id}`,
    calleeIce: (id: string) => `rtc_eice_${id}`,
    diag: (role: string, id: string) => `rtc_diag_${role}_${id}`,
};

async function sigSet(key: string, val: unknown) {
    await cloudSet(key, val);
}
async function sigGet<T>(key: string): Promise<T | null> {
    try { return await cloudGet<T>(key); } catch { return null; }
}

// ── Media helper with tiered camera fallback ─────────────────

async function getMedia(type: 'audio' | 'video'): Promise<MediaStream> {
    if (type === 'video') {
        // 1. Try moderate resolution for smooth TURN relay streaming
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: {
                    width: { ideal: 480, max: 640 },
                    height: { ideal: 360, max: 480 },
                    frameRate: { ideal: 20, max: 24 },
                    facingMode: 'user',
                },
            });
        } catch (e1) {
            console.warn('[WebRTC] Ideal video constraints failed, trying basic video: true', e1);
            // 2. Fallback to basic video: true
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: true,
                });
            } catch (e2) {
                console.warn('[WebRTC] Camera unavailable or locked, falling back to audio-only', e2);
                // 3. Fallback to audio-only so call still connects & receives remote video
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false,
                    });
                } catch (e3: unknown) {
                    const err = e3 as Error;
                    if (err.name === 'NotAllowedError') {
                        throw new Error('Please allow microphone access in your browser settings');
                    }
                    throw new Error('Could not access microphone: ' + err.message);
                }
            }
        }
    } else {
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false,
            });
        } catch (err: unknown) {
            const e = err as Error;
            if (e.name === 'NotAllowedError') {
                throw new Error('Please allow microphone access in your browser settings');
            }
            throw new Error('Could not access microphone: ' + e.message);
        }
    }
}

// ── Diagnostics helper ───────────────────────────────────────

async function logDiagnostics(pc: RTCPeerConnection, role: string, callId: string) {
    try {
        const stats = await pc.getStats();
        let audioBytesRecv = 0;
        let videoBytesRecv = 0;
        let audioBytesSent = 0;
        let videoBytesSent = 0;
        let framesDecoded = 0;
        let framesEncoded = 0;
        let selectedPair: {
            state?: string;
            localId?: string;
            remoteId?: string;
            bytesSent?: number;
            bytesReceived?: number;
        } | null = null;
        const candidates = new Map<string, Record<string, unknown>>();

        stats.forEach((report) => {
            if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
                candidates.set(report.id, {
                    type: report.candidateType,
                    protocol: report.protocol,
                    address: report.address || report.ip,
                    port: report.port,
                });
            }
            if (report.type === 'inbound-rtp') {
                if (report.kind === 'audio') audioBytesRecv = report.bytesReceived || 0;
                if (report.kind === 'video') {
                    videoBytesRecv = report.bytesReceived || 0;
                    framesDecoded = report.framesDecoded || 0;
                }
            }
            if (report.type === 'outbound-rtp') {
                if (report.kind === 'audio') audioBytesSent = report.bytesSent || 0;
                if (report.kind === 'video') {
                    videoBytesSent = report.bytesSent || 0;
                    framesEncoded = report.framesEncoded || 0;
                }
            }
            if (report.type === 'candidate-pair' && (report.selected || report.nominated)) {
                selectedPair = {
                    state: report.state,
                    localId: report.localCandidateId,
                    remoteId: report.remoteCandidateId,
                    bytesSent: report.bytesSent,
                    bytesReceived: report.bytesReceived,
                };
            }
        });

        const pair = selectedPair as {
            state?: string;
            localId?: string;
            remoteId?: string;
            bytesSent?: number;
            bytesReceived?: number;
        } | null;

        const diag = {
            ts: new Date().toISOString(),
            iceConnectionState: pc.iceConnectionState,
            connectionState: pc.connectionState,
            signalingState: pc.signalingState,
            iceGatheringState: pc.iceGatheringState,
            audioBytesRecv,
            videoBytesRecv,
            audioBytesSent,
            videoBytesSent,
            framesDecoded,
            framesEncoded,
            selectedPair: pair ? {
                ...pair,
                local: pair.localId ? candidates.get(pair.localId) : null,
                remote: pair.remoteId ? candidates.get(pair.remoteId) : null,
            } : null,
        };
        console.log(`[WebRTC Diag ${role}]`, diag);
        await sigSet(KEY.diag(role, callId), diag);
    } catch { /* ignore */ }
}

// ── Hook ────────────────────────────────────────────────────

export function useWebRTC() {
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteMediaStreamRef = useRef<MediaStream | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const diagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Call tracking refs to prevent re-entrant teardown loops
    const activeCallIdRef = useRef<string | null>(null);
    const isStartingRef = useRef(false);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [iceStatus, setIceStatus] = useState<string>('new');
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);

    const ensureAudioEl = useCallback(() => {
        if (!audioRef.current) {
            const a = document.createElement('audio');
            a.autoplay = true;
            a.setAttribute('playsinline', '');
            a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
            document.body.appendChild(a);
            audioRef.current = a;
        }
        return audioRef.current;
    }, []);

    // ── Single dedicated audio element for remote audio tracks ──
    const playRemoteAudio = useCallback((stream: MediaStream | null) => {
        if (!stream) return;
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) return;

        const a = ensureAudioEl();

        // Attach audio-only MediaStream so audio playback never conflicts with <video>
        const audioOnlyStream = new MediaStream(audioTracks);
        a.srcObject = audioOnlyStream;
        a.muted = false;
        a.volume = 1.0;

        a.play()
            .then(() => {
                if (mountedRef.current) setAudioBlocked(false);
            })
            .catch((err) => {
                console.warn('[WebRTC] Remote audio autoplay blocked:', err);
                if (mountedRef.current) setAudioBlocked(true);
            });
    }, [ensureAudioEl]);

    const unlockAudio = useCallback(() => {
        const a = ensureAudioEl();
        if (remoteMediaStreamRef.current && remoteMediaStreamRef.current.getAudioTracks().length > 0) {
            playRemoteAudio(remoteMediaStreamRef.current);
        } else {
            a.muted = false;
            a.play().catch(() => {});
        }
    }, [ensureAudioEl, playRemoteAudio]);

    useEffect(() => {
        if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
        playRemoteAudio(remoteStream);
    }, [remoteStream, playRemoteAudio]);

    // Auto-unlock audio on any user interaction if browser blocked autoplay
    useEffect(() => {
        if (!audioBlocked) return;
        const onInteract = () => unlockAudio();
        window.addEventListener('click', onInteract, { once: true });
        window.addEventListener('touchstart', onInteract, { once: true });
        return () => {
            window.removeEventListener('click', onInteract);
            window.removeEventListener('touchstart', onInteract);
        };
    }, [audioBlocked, unlockAudio]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cleanupAll(true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cleanupAll = (removeAudioEl = false) => {
        activeCallIdRef.current = null;
        isStartingRef.current = false;

        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }

        if (diagTimerRef.current) {
            clearTimeout(diagTimerRef.current);
            diagTimerRef.current = null;
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
                if (removeAudioEl) {
                    audioRef.current.remove();
                    audioRef.current = null;
                }
            } catch { }
        }
    };

    const cleanup = useCallback(() => {
        cleanupAll();
        setLocalStream(null);
        setRemoteStream(null);
        setIsConnected(false);
        setIceStatus('new');
        setAudioBlocked(false);
        setPermissionError(null);
    }, []);

    // ── Shared peer-connection creation (tracks added by caller/callee in proper order) ──
    const createPC = (config: RTCConfiguration, role: 'caller' | 'callee', callId: string) => {
        const pc = new RTCPeerConnection(config);
        pcRef.current = pc;

        const streamContainer = new MediaStream();
        remoteMediaStreamRef.current = streamContainer;

        pc.ontrack = (e) => {
            console.log(`[WebRTC ${role}] ontrack:`, e.track.kind, 'id:', e.track.id, 'muted:', e.track.muted);
            if (!mountedRef.current) return;

            if (!streamContainer.getTracks().some(t => t.id === e.track.id)) {
                streamContainer.addTrack(e.track);
            }

            // Always emit a new MediaStream instance so React reliably re-renders
            setRemoteStream(new MediaStream(streamContainer.getTracks()));

            e.track.onunmute = () => {
                console.log(`[WebRTC ${role}] track unmuted:`, e.track.kind);
                if (mountedRef.current) {
                    const updated = new MediaStream(streamContainer.getTracks());
                    setRemoteStream(updated);
                    if (e.track.kind === 'audio') {
                        playRemoteAudio(updated);
                    }
                }
            };
        };

        let postConnectDiagScheduled = false;

        const syncConnectionState = () => {
            if (!mountedRef.current) return;
            const cs = pc.connectionState;
            const is = pc.iceConnectionState;
            console.log(`[WebRTC ${role}] state: conn=${cs}, ice=${is}`);
            setIceStatus(cs && cs !== 'new' ? cs : is);

            // Require full ICE + DTLS connection (connectionState === 'connected') when supported
            const fullyConnected = cs ? cs === 'connected' : (is === 'connected' || is === 'completed');

            if (fullyConnected) {
                setIsConnected(true);
                // Re-emit remote stream & re-trigger audio playback once DTLS/SRTP is actually flowing
                if (remoteMediaStreamRef.current) {
                    const live = new MediaStream(remoteMediaStreamRef.current.getTracks());
                    setRemoteStream(live);
                    playRemoteAudio(live);
                }
                if (!postConnectDiagScheduled) {
                    postConnectDiagScheduled = true;
                    setTimeout(() => {
                        if (pcRef.current === pc && pc.connectionState !== 'closed') {
                            logDiagnostics(pc, role, callId);
                        }
                    }, 3000);
                }
            } else if (cs === 'failed' || cs === 'closed' || is === 'failed' || is === 'closed') {
                setIsConnected(false);
            }
        };

        pc.onconnectionstatechange = syncConnectionState;
        pc.oniceconnectionstatechange = syncConnectionState;

        // Capture diagnostics 8s into call for visibility
        diagTimerRef.current = setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== 'closed') {
                logDiagnostics(pc, role, callId);
            }
        }, 8000);

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

        const scheduleFlush = (delay = 150) => {
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
                scheduleFlush(150);
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
            return;
        }
        for (const c of candidates) {
            if (!c.candidate || appliedSet.has(c.candidate)) continue;
            try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
                appliedSet.add(c.candidate);
            } catch {
                // Ignore transient error and retry next poll if needed
            }
        }
    };

    // ═══════════ CALLER (Doctor or Patient Initiator) ═══════════
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
            const [stream, config] = await Promise.all([
                getMedia(callType).catch((e: Error) => { setPermissionError(e.message); throw e; }),
                getIceConfig(),
            ]);

            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = createPC(config, 'caller', callId);

            // Caller adds local tracks BEFORE createOffer
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            // If video call but caller had no camera, add recvonly video transceiver
            if (callType === 'video' && stream.getVideoTracks().length === 0) {
                pc.addTransceiver('video', { direction: 'recvonly' });
            }

            const icePusher = createIcePusher(KEY.callerIce(callId));
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    icePusher.push(e.candidate);
                } else {
                    icePusher.flush();
                }
            };

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: callType === 'video',
            });
            await pc.setLocalDescription(offer);
            await sigSet(KEY.offer(callId), { type: offer.type, sdp: offer.sdp || '' });

            isStartingRef.current = false;

            let answerApplied = false;
            const appliedCalleeIce = new Set<string>();

            pollRef.current = setInterval(async () => {
                if (!mountedRef.current || !pcRef.current || pcRef.current.connectionState === 'closed') {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    return;
                }
                const p = pcRef.current;

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanup]);

    // ═══════════ CALLEE (Receiver) ═══════════
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
            const [offerData, stream, config] = await Promise.all([
                (async () => {
                    for (let i = 0; i < 15; i++) {
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

            const pc = createPC(config, 'callee', callId);

            const icePusher = createIcePusher(KEY.calleeIce(callId));
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    icePusher.push(e.candidate);
                } else {
                    icePusher.flush();
                }
            };

            // 1. Set remote offer FIRST (creates Unified Plan transceivers matching offer m-lines)
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: offerData.type as RTCSdpType,
                sdp: offerData.sdp,
            }));

            // 2. Bind local tracks to the existing transceivers cleanly
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Ensure video transceiver stays recvonly if callee has no camera
            if (callType === 'video' && stream.getVideoTracks().length === 0) {
                const videoTr = pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
                if (videoTr) {
                    videoTr.direction = 'recvonly';
                }
            }

            // 3. Create and set local answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sigSet(KEY.answer(callId), { type: answer.type, sdp: answer.sdp || '' });

            isStartingRef.current = false;
            icePusher.flush();

            // 4. Safely apply caller ICE candidates now that both descriptions are set
            const appliedCallerIce = new Set<string>();
            const initialCallerIce = await sigGet<IceEntry[]>(KEY.callerIce(callId));
            if (initialCallerIce && initialCallerIce.length > 0) {
                await applyIceCandidates(pc, initialCallerIce, appliedCallerIce);
            }

            // 5. Poll for late caller ICE candidates
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        toggleMute, toggleCamera, stopCall, cleanup, unlockAudio,
        localStream, remoteStream, isConnected, iceStatus, audioBlocked, permissionError,
    };
}
