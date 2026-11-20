import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  durationSec?: number;
  peaks?: number[];
  isOwn: boolean;
}

function formatSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  durationSec = 0,
  peaks,
  isOwn,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSec);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5>(1);

  const bars =
    peaks && peaks.length > 0
      ? peaks
      : [0.28, 0.45, 0.62, 0.35, 0.78, 0.9, 0.55, 0.42, 0.66, 0.85, 0.5, 0.38, 0.72, 0.6, 0.4, 0.3, 0.52, 0.68, 0.44, 0.32];

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      await audio.play();
      setIsPlaying(true);
    }
  };

  const toggleSpeed = () => {
    const next = playbackRate === 1 ? 1.5 : 1;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const handleSeekBar = (idx: number) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const ratio = idx / bars.length;
    audio.currentTime = ratio * totalDuration;
    setCurrentTime(audio.currentTime);
  };

  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  return (
    <div className="flex items-center gap-3 min-w-[230px] max-w-[320px] py-1">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Jeda pesan suara' : 'Putar pesan suara'}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-[3px] h-7" role="group" aria-label="Gelombang audio">
          {bars.map((peak, i) => {
            const barRatio = i / bars.length;
            const isPlayed = barRatio <= progressRatio;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSeekBar(i)}
                aria-label={`Lompat ke ${Math.round(barRatio * 100)}%`}
                className="flex-1 h-full flex items-center justify-center group focus:outline-none"
              >
                <span
                  style={{ height: `${Math.max(18, Math.round(peak * 100))}%` }}
                  className={`w-full rounded-full transition-colors ${
                    isOwn
                      ? isPlayed
                        ? 'bg-white'
                        : 'bg-white/40 group-hover:bg-white/65'
                      : isPlayed
                        ? 'bg-teal-700 dark:bg-teal-400'
                        : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div
          className={`flex items-center justify-between text-[11px] font-mono tabular-nums ${
            isOwn ? 'text-teal-50/90' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span>
            {formatSec(currentTime)} / {formatSec(totalDuration)}
          </span>
          <button
            type="button"
            onClick={toggleSpeed}
            className="font-semibold hover:underline focus:outline-none"
            title="Ubah kecepatan putar"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
