'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Phone, Video, PhoneOff, PhoneIncoming, Mic, MicOff, Camera, CameraOff, Clock,
    Monitor, MonitorOff, PhoneCall, PhoneMissed, X, Volume2
} from 'lucide-react';
import { getCurrentUser, generateId, type CallLog } from '@/lib/store';
import { cloudGetCallLogs, cloudGetActiveCall, cloudUpdateCallLog, cloudAddCallLog, cloudAddNotification } from '@/lib/shared-store';
import { useLanguage } from '@/lib/LanguageProvider';
import { useWebRTC } from '@/hooks/useWebRTC';

const DOCTORS = [
    { id: 'doc1', name: 'Dr. Priya Sharma', specialty: 'Nephrologist', initials: 'PS' },
    { id: 'doc2', name: 'Dr. Rajesh Kumar', specialty: 'Cardiologist', initials: 'RK' },
    { id: 'doc3', name: 'Dr. Ananya Patel', specialty: 'General Physician', initials: 'AP' },
    { id: 'doc4', name: 'Dr. Suresh Reddy', specialty: 'Orthopedic', initials: 'SR' },
];

export default function UserCallsPage() {
    const { t } = useLanguage();
    const webrtc = useWebRTC();
    const [userId, setUserId] = useState('');
    const [callHistory, setCallHistory] = useState<CallLog[]>([]);
    const [activeCall, setActiveCall] = useState<CallLog | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [isScreenShare, setIsScreenShare] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [showDialer, setShowDialer] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState('doc1');
    const [remoteVideoPlaying, setRemoteVideoPlaying] = useState(false);

    const activeCallRef = useRef<CallLog | null>(null);
    const callDurationRef = useRef(0);
    const userIdRef = useRef('');
    const startingCallIdRef = useRef<string | null>(null);
    const isCallerRef = useRef(false);

    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
    useEffect(() => { callDurationRef.current = callDuration; }, [callDuration]);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    // Attach & play remote video (video-only stream, muted — audio handled by useWebRTC)
    useEffect(() => {
        const video = remoteVideoRef.current;
        const videoTracks = webrtc.remoteStream?.getVideoTracks() || [];
        if (!video || videoTracks.length === 0) {
            setRemoteVideoPlaying(false);
            return;
        }

        const currentTracks = (video.srcObject as MediaStream | null)?.getVideoTracks() || [];
        const sameTrack = currentTracks.length === videoTracks.length &&
            currentTracks.every((t, i) => t.id === videoTracks[i].id);
        if (!sameTrack) {
            video.srcObject = new MediaStream(videoTracks);
        }
        video.muted = true;

        const markIfReady = () => {
            if (video.videoWidth > 0 || video.readyState >= 2) {
                setRemoteVideoPlaying(true);
            }
        };

        const tryPlay = () => {
            video.play()
                .then(markIfReady)
                .catch(() => {});
        };

        tryPlay();
        video.onloadedmetadata = tryPlay;
        video.onloadeddata = tryPlay;
        video.oncanplay = tryPlay;

        // Safety retry loop until first decoded video frame renders
        const checkTimer = setInterval(() => {
            if (video.videoWidth > 0 && !video.paused) {
                setRemoteVideoPlaying(true);
                clearInterval(checkTimer);
            } else if (video.srcObject) {
                tryPlay();
            }
        }, 500);

        return () => clearInterval(checkTimer);
    }, [webrtc.remoteStream, webrtc.isConnected, activeCall?.status, activeCall?.type]);

    // Attach & play local video when stream updates or video element mounts
    useEffect(() => {
        const video = localVideoRef.current;
        if (!video || !webrtc.localStream) return;

        if (video.srcObject !== webrtc.localStream) {
            video.srcObject = webrtc.localStream;
        }
        video.muted = true;
        video.play().catch(() => {});
        video.onloadedmetadata = () => { video.play().catch(() => {}); };
    }, [webrtc.localStream, activeCall?.status, activeCall?.type]);

    useEffect(() => {
        const user = getCurrentUser();
        if (!user) return;
        setUserId(user.id);
        cloudGetCallLogs(user.id, 'user').then(setCallHistory);
    }, []);

    // Status polling interval
    useEffect(() => {
        if (!userId) return;
        let isMounted = true;
        const interval = setInterval(async () => {
            try {
                const call = await cloudGetActiveCall();
                if (!isMounted) return;
                if (call && call.userId === userId && (call.status === 'ringing' || call.status === 'ongoing')) {
                    const acceptedInThisTab = typeof window !== 'undefined' && sessionStorage.getItem('hs_accepted_call') === call.id;

                    // If another browser tab accepted this call, don't hijack WebRTC or show duplicate call screen here
                    if (call.status === 'ongoing' && !isCallerRef.current && !acceptedInThisTab) {
                        if (activeCallRef.current?.id === call.id && activeCallRef.current.status === 'ringing') {
                            setActiveCall(null);
                        }
                        return;
                    }

                    setActiveCall(prev => {
                        if (!prev || prev.id !== call.id) return call;
                        if (prev.status === 'ongoing' && call.status === 'ringing') return prev;
                        if (prev.status !== call.status) return call;
                        return prev;
                    });

                    // Callee auto-start ONLY for the tab that accepted the call (e.g. via IncomingCallOverlay)
                    if (call.status === 'ongoing' && !isCallerRef.current && acceptedInThisTab) {
                        if (startingCallIdRef.current !== call.id) {
                            startingCallIdRef.current = call.id;
                            try {
                                webrtc.startAsCalleeAsync(call.id, call.type || 'audio');
                            } catch (err) {
                                console.error('Auto-start callee WebRTC failed:', err);
                            }
                        }
                    }
                } else if (activeCallRef.current && call === null) {
                    startingCallIdRef.current = null;
                    isCallerRef.current = false;
                    try { sessionStorage.removeItem('hs_accepted_call'); } catch { }
                    webrtc.stopCall();
                    setActiveCall(null);
                    setCallDuration(0);
                    setRemoteVideoPlaying(false);
                    const history = await cloudGetCallLogs(userId, 'user');
                    if (isMounted) setCallHistory(history);
                }
            } catch {
                // Ignore transient network errors
            }
        }, 1500);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [userId]);

    // Timer
    useEffect(() => {
        if (!activeCall || activeCall.status !== 'ongoing' || !webrtc.isConnected) return;
        const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
        return () => clearInterval(interval);
    }, [activeCall?.status, webrtc.isConnected]);

    // Start a call from patient to doctor
    const startCallAsPatient = async (type: 'audio' | 'video') => {
        if (!selectedDoc || !userId) return;
        webrtc.unlockAudio();
        const doc = DOCTORS.find(d => d.id === selectedDoc) || DOCTORS[0];
        const user = getCurrentUser();
        const call: CallLog = {
            id: generateId(),
            doctorId: doc.id,
            doctorName: doc.name,
            userId,
            userName: user?.name || 'Patient',
            type,
            status: 'ringing',
            startTime: new Date().toISOString(),
        };

        isCallerRef.current = true;
        startingCallIdRef.current = call.id;
        setRemoteVideoPlaying(false);
        await cloudAddCallLog(call);
        setActiveCall(call);
        setCallDuration(0);
        setShowDialer(false);

        try {
            await webrtc.startAsCallerAsync(call.id, type);
        } catch (e) {
            console.error('Patient startAsCallerAsync failed:', e);
        }
    };

    // Accept an incoming call from doctor
    const acceptCall = async () => {
        if (!activeCall) return;
        const callToAccept = activeCall;
        webrtc.unlockAudio();
        isCallerRef.current = false;
        startingCallIdRef.current = callToAccept.id;
        try { sessionStorage.setItem('hs_accepted_call', callToAccept.id); } catch { }
        setRemoteVideoPlaying(false);
        setActiveCall(prev => prev ? { ...prev, status: 'ongoing' } : null);
        setCallDuration(0);

        // Create and publish WebRTC SDP answer FIRST so this tab always owns the connection
        // before marking status 'ongoing' in Redis
        try {
            await webrtc.startAsCalleeAsync(callToAccept.id, callToAccept.type || 'audio');
        } catch (e) {
            console.error('WebRTC callee setup failed:', e);
        }

        await cloudUpdateCallLog(callToAccept.id, { status: 'ongoing' });

        await cloudAddNotification({
            id: generateId(), userId, type: 'call',
            title: `${callToAccept.type === 'video' ? 'Video' : 'Audio'} Call Started`,
            message: `Connected with ${callToAccept.doctorName}`,
            timestamp: new Date().toISOString(), read: false,
        });
    };

    const rejectCall = async () => {
        if (!activeCall) return;
        startingCallIdRef.current = null;
        isCallerRef.current = false;
        try { sessionStorage.removeItem('hs_accepted_call'); } catch { }
        webrtc.stopCall();
        setRemoteVideoPlaying(false);
        await cloudUpdateCallLog(activeCall.id, { status: 'missed', endTime: new Date().toISOString() });
        await cloudAddNotification({
            id: generateId(), userId, type: 'call',
            title: 'Missed Call',
            message: `Missed call from ${activeCall.doctorName}`,
            timestamp: new Date().toISOString(), read: false,
        });
        setActiveCall(null);
        const history = await cloudGetCallLogs(userId, 'user');
        setCallHistory(history);
    };

    const endCall = async () => {
        const call = activeCallRef.current;
        if (!call) return;
        startingCallIdRef.current = null;
        isCallerRef.current = false;
        try { sessionStorage.removeItem('hs_accepted_call'); } catch { }
        webrtc.stopCall();
        setRemoteVideoPlaying(false);
        await cloudUpdateCallLog(call.id, { status: 'completed', endTime: new Date().toISOString(), duration: callDurationRef.current });
        await cloudAddNotification({
            id: generateId(), userId: userIdRef.current, type: 'call',
            title: 'Call Ended',
            message: `Call with ${call.doctorName} ended. Duration: ${formatDuration(callDurationRef.current)}`,
            timestamp: new Date().toISOString(), read: false,
        });
        setActiveCall(null);
        setCallDuration(0);
        setIsScreenShare(false);
        const history = await cloudGetCallLogs(userIdRef.current, 'user');
        setCallHistory(history);
    };

    const formatDuration = (secs: number) => {
        const m = Math.floor(secs / 60); const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const totalCalls = callHistory.length;
    const completedCalls = callHistory.filter(c => c.status === 'completed').length;
    const missedCalls = callHistory.filter(c => c.status === 'missed').length;
    const totalDuration = callHistory.reduce((sum, c) => sum + (c.duration || 0), 0);

    const hasLocalVideo = webrtc.localStream && webrtc.localStream.getVideoTracks().length > 0;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 800 }}>{t('calls.title')}</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{t('calls.subtitle')}</p>
                </div>
                {!activeCall && (
                    <button className="btn-primary" onClick={() => setShowDialer(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                        <Phone size={16} /> Call Doctor
                    </button>
                )}
            </div>

            {/* New Call / Call Doctor Modal */}
            <AnimatePresence>
                {showDialer && !activeCall && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1001, padding: 20, backdropFilter: 'blur(6px)',
                    }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card-static" style={{ padding: 28, width: '100%', maxWidth: 440 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Call Doctor</h2>
                                <button onClick={() => setShowDialer(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Select Doctor</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                                {DOCTORS.map(doc => (
                                    <div key={doc.id} onClick={() => setSelectedDoc(doc.id)} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12,
                                        border: `1.5px solid ${selectedDoc === doc.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'}`,
                                        background: selectedDoc === doc.id ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.02)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10, background: 'var(--gradient-primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14,
                                        }}>
                                            {doc.initials}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{doc.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.specialty}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <button className="btn-secondary" onClick={() => startCallAsPatient('audio')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }}>
                                    <Phone size={16} style={{ color: '#0EA5E9' }} /> Audio Call
                                </button>
                                <button className="btn-primary" onClick={() => startCallAsPatient('video')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }}>
                                    <Video size={16} /> Video Call
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {totalCalls > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                    {[
                        { label: 'Total Calls', value: totalCalls, icon: PhoneCall, color: '#0EA5E9' },
                        { label: 'Completed', value: completedCalls, icon: Phone, color: '#10B981' },
                        { label: 'Missed', value: missedCalls, icon: PhoneMissed, color: '#EF4444' },
                        { label: 'Talk Time', value: formatDuration(totalDuration), icon: Clock, color: '#8B5CF6' },
                    ].map((stat, i) => (
                        <div key={i} className="glass-card-static" style={{ padding: 16, textAlign: 'center' }}>
                            <stat.icon size={20} style={{ color: stat.color, marginBottom: 8 }} />
                            <div style={{ fontWeight: 800, fontSize: 20 }}>{stat.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Incoming Call Overlay */}
            <AnimatePresence>
                {activeCall && activeCall.status === 'ringing' && !isCallerRef.current && (
                    <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
                            padding: 16, display: 'flex', justifyContent: 'center',
                        }}>
                        <div style={{
                            width: '100%', maxWidth: 420, padding: '20px 24px', borderRadius: 20,
                            background: 'linear-gradient(135deg, #0B1120f5, #1a0b2ef5)',
                            backdropFilter: 'blur(24px)', border: '1px solid rgba(14,165,233,0.4)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(14,165,233,0.15)',
                            display: 'flex', alignItems: 'center', gap: 16,
                        }}>
                            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                                style={{
                                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                                    background: activeCall.type === 'video'
                                        ? 'linear-gradient(135deg, #8B5CF6, #6366F1)'
                                        : 'linear-gradient(135deg, #10B981, #0EA5E9)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                <PhoneIncoming size={24} style={{ color: 'white' }} />
                            </motion.div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {activeCall.doctorName}
                                </div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                                    Incoming {activeCall.type === 'video' ? 'Video' : 'Audio'} Call
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                <button onClick={rejectCall} style={{
                                    width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                    background: '#EF4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(239,68,68,0.4)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                                }}><PhoneOff size={20} /></button>
                                <button onClick={acceptCall} style={{
                                    width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                    background: '#10B981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(16,185,129,0.4)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                                }}><Phone size={20} /></button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active / Ongoing Call Screen */}
            <AnimatePresence>
                {activeCall && (activeCall.status === 'ongoing' || (activeCall.status === 'ringing' && isCallerRef.current)) && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: activeCall.type === 'video' ? 'linear-gradient(135deg, #0B1120, #1a0b2e)' : 'linear-gradient(135deg, #0B1120, #0c2035)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
                        }}>

                        {/* Remote Video (muted — audio plays cleanly via useWebRTC's dedicated audio element) */}
                        {activeCall.type === 'video' && (
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                muted
                                onPlaying={() => setRemoteVideoPlaying(true)}
                                onCanPlay={(e) => { if (e.currentTarget.videoWidth > 0) setRemoteVideoPlaying(true); }}
                                onLoadedData={(e) => { if (e.currentTarget.videoWidth > 0) setRemoteVideoPlaying(true); }}
                                onResize={(e) => { if (e.currentTarget.videoWidth > 0) setRemoteVideoPlaying(true); }}
                                onEmptied={() => setRemoteVideoPlaying(false)}
                                style={{
                                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                                    objectFit: 'cover',
                                    opacity: remoteVideoPlaying ? 1 : 0,
                                    transition: 'opacity 0.4s ease',
                                    zIndex: 1,
                                }}
                            />
                        )}

                        {/* Local Video (patient's picture-in-picture) */}
                        {activeCall.type === 'video' && (
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{
                                    position: 'absolute', bottom: 100, right: 20, width: 130, height: 180,
                                    borderRadius: 14, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)',
                                    zIndex: 10, background: '#000',
                                    opacity: hasLocalVideo ? 1 : 0,
                                    display: hasLocalVideo ? 'block' : 'none',
                                }}
                            />
                        )}

                        {/* Doctor info & Avatar (shown in Audio call OR until remote video frames actually play) */}
                        {(activeCall.type === 'audio' || !remoteVideoPlaying) && (
                            <>
                                <div style={{
                                    width: 100, height: 100, borderRadius: '50%', background: 'var(--gradient-primary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'white', fontWeight: 700,
                                    zIndex: 2,
                                }}>
                                    {activeCall.doctorName.split(' ').pop()?.charAt(0) || 'D'}
                                </div>
                                <h2 style={{ fontSize: 24, fontWeight: 700, color: 'white', zIndex: 2 }}>{activeCall.doctorName}</h2>
                            </>
                        )}

                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, zIndex: 2, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                            {activeCall.status === 'ringing' ? 'Calling doctor... waiting for answer' : formatDuration(callDuration)}
                        </p>

                        {/* Permission error */}
                        {webrtc.permissionError && (
                            <div style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: 12, maxWidth: 300, textAlign: 'center', zIndex: 2 }}>
                                {webrtc.permissionError}
                            </div>
                        )}

                        {/* Audio autoplay unblock prompt */}
                        {webrtc.audioBlocked && (
                            <button onClick={webrtc.unlockAudio} style={{
                                display: 'flex', alignItems: 'center', gap: 8, zIndex: 10,
                                padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(14,165,233,0.5)',
                                background: 'rgba(14,165,233,0.25)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                                <Volume2 size={14} /> Tap to Enable Audio
                            </button>
                        )}

                        {/* Connection status */}
                        {activeCall.status === 'ongoing' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, zIndex: 2, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: webrtc.isConnected ? '#10B981' : '#F59E0B' }} />
                                <span style={{ color: webrtc.isConnected ? '#10B981' : '#F59E0B', fontSize: 11, fontWeight: 600 }}>
                                    {webrtc.isConnected
                                        ? 'Connected'
                                        : (webrtc.iceStatus && webrtc.iceStatus !== 'new' ? `Connecting (${webrtc.iceStatus})...` : 'Connecting...')}
                                </span>
                            </div>
                        )}

                        {/* Call Action Controls */}
                        <div style={{ display: 'flex', gap: 16, marginTop: 20, position: 'relative', zIndex: 10000 }}>
                            <button onClick={() => { const newVal = !isMuted; setIsMuted(newVal); webrtc.toggleMute(newVal); }} style={{
                                width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                background: isMuted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)', color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                            </button>

                            {activeCall.type === 'video' && (
                                <>
                                    <button onClick={() => { const newVal = !isCamOff; setIsCamOff(newVal); webrtc.toggleCamera(newVal); }} style={{
                                        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                        background: isCamOff ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {isCamOff ? <CameraOff size={22} /> : <Camera size={22} />}
                                    </button>
                                    <button onClick={() => setIsScreenShare(!isScreenShare)} style={{
                                        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                        background: isScreenShare ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {isScreenShare ? <MonitorOff size={22} /> : <Monitor size={22} />}
                                    </button>
                                </>
                            )}

                            <button onClick={endCall} style={{
                                width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                background: '#EF4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <PhoneOff size={22} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* History Table */}
            {callHistory.length === 0 ? (
                <div className="glass-card-static" style={{ padding: 60, textAlign: 'center' }}>
                    <Phone size={48} style={{ color: 'var(--text-muted)', marginBottom: 14, opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{t('calls.noHistory')}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>When your doctor calls you, or when you call your doctor, it will appear here.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {callHistory.slice().reverse().map((c, i) => (
                        <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                            className="glass-card" style={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: c.type === 'video' ? 'rgba(139,92,246,0.1)' : 'rgba(14,165,233,0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {c.type === 'video' ? <Video size={18} style={{ color: '#8B5CF6' }} /> : <Phone size={18} style={{ color: '#0EA5E9' }} />}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.doctorName}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={10} /> {new Date(c.startTime).toLocaleString()} {c.duration ? `• ${formatDuration(c.duration)}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <span style={{
                                    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                    background: c.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                    color: c.status === 'completed' ? '#10B981' : '#EF4444',
                                }}>{c.status}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
