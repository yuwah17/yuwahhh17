import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';

export interface WebRtcSignalEvent {
  fromClientId: string;
  fromDisplayName: string;
  signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'ring';
  payload: unknown;
}

interface LiveVoiceCallPanelProps {
  roomId: string;
  localClientId: string;
  localDisplayName: string;
  participantCount: number;
  incomingSignal: WebRtcSignalEvent | null;
  onSendSignal: (signal: {
    targetClientId?: string;
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'ring';
    payload: unknown;
  }) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const LiveVoiceCallPanel: React.FC<LiveVoiceCallPanelProps> = ({
  roomId,
  localClientId,
  participantCount,
  incomingSignal,
  onSendSignal,
}) => {
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [peerName, setPeerName] = useState<string>('');
  const [peerClientId, setPeerClientId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  const cleanupCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingOfferRef.current = null;
    setCallState('idle');
    setPeerClientId(null);
    setPeerName('');
    setIsMuted(false);
    setElapsedSec(0);
  };

  useEffect(() => {
    cleanupCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (callState !== 'connected') return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const createPeerConnection = (targetId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSendSignal({
          targetClientId: targetId,
          signalType: 'ice-candidate',
          payload: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        cleanupCall();
      }
    };

    pcRef.current = pc;
    return pc;
  };

  useEffect(() => {
    if (!incomingSignal || incomingSignal.fromClientId === localClientId) return;

    const handleSignal = async () => {
      if (incomingSignal.signalType === 'offer') {
        pendingOfferRef.current = incomingSignal.payload as RTCSessionDescriptionInit;
        setPeerClientId(incomingSignal.fromClientId);
        setPeerName(incomingSignal.fromDisplayName);
        setCallState('incoming');
      } else if (incomingSignal.signalType === 'answer' && pcRef.current) {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(incomingSignal.payload as RTCSessionDescriptionInit),
        );
        setCallState('connected');
      } else if (incomingSignal.signalType === 'ice-candidate' && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(incomingSignal.payload as RTCIceCandidateInit),
          );
        } catch {
          // Ignore stale ICE candidates
        }
      } else if (incomingSignal.signalType === 'hangup') {
        cleanupCall();
      }
    };

    handleSignal().catch((err) => {
      setCallError(err instanceof Error ? err.message : 'Gagal memproses sinyal panggilan.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingSignal]);

  const startCall = async () => {
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;

      const pc = createPeerConnection('');
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallState('calling');
      onSendSignal({
        signalType: 'offer',
        payload: offer,
      });
    } catch (err) {
      setCallError(
        err instanceof Error
          ? err.message
          : 'Izin mikrofon diperlukan untuk memulai panggilan suara.',
      );
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!pendingOfferRef.current || !peerClientId) return;
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;

      const pc = createPeerConnection(peerClientId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      onSendSignal({
        targetClientId: peerClientId,
        signalType: 'answer',
        payload: answer,
      });
      setCallState('connected');
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Gagal menerima panggilan.');
      cleanupCall();
    }
  };

  const hangupCall = () => {
    onSendSignal({
      targetClientId: peerClientId || undefined,
      signalType: 'hangup',
      payload: null,
    });
    cleanupCall();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="shrink-0">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {callState === 'idle' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startCall}
            disabled={participantCount < 2}
            title={
              participantCount < 2
                ? 'Menunggu minimal 1 rekan bergabung untuk panggilan suara P2P'
                : 'Mulai panggilan suara WebRTC DTLS-SRTP'
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Phone className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span>Panggilan Suara</span>
          </button>
          {callError && (
            <span className="text-[11px] text-rose-600 dark:text-rose-400">{callError}</span>
          )}
        </div>
      )}

      {callState === 'calling' && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-800/60 text-xs">
          <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200">
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            <span>Memanggil peserta di ruang ini via WebRTC terenkripsi DTLS-SRTP...</span>
          </div>
          <button
            type="button"
            onClick={hangupCall}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Batalkan</span>
          </button>
        </div>
      )}

      {callState === 'incoming' && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-teal-50 dark:bg-teal-950/50 border-b border-teal-200 dark:border-teal-800 text-xs">
          <div className="font-medium text-teal-950 dark:text-teal-100">
            Panggilan suara masuk dari <strong>{peerName}</strong> (DTLS-SRTP)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={hangupCall}
              className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              Tolak
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Terima</span>
            </button>
          </div>
        </div>
      )}

      {callState === 'connected' && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-teal-700 dark:bg-teal-900 text-white text-xs">
          <div className="flex items-center gap-2.5 font-mono tabular-nums">
            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Terhubung {peerName ? `dengan ${peerName}` : ''} · {formatClock(elapsedSec)} · DTLS-SRTP
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/15 hover:bg-white/25"
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isMuted ? 'Dibisukan' : 'Mikrofon Aktif'}</span>
            </button>
            <button
              type="button"
              onClick={hangupCall}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 font-semibold"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Akhiri</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
