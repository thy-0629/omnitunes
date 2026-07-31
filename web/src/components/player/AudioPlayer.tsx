import { useEffect, useRef } from 'react';
import { currentAudioUrl, usePlayerStore } from '@/stores/player';
import { wsClient } from '@/lib/ws';

const PROGRESS_REPORT_INTERVAL_MS = 5000;

/**
 * Invisible <audio> element bound to the player store.
 *
 * - plays `stream` / `local` options (embed options render in EmbedPlayer)
 * - timeupdate → store + throttled WS progress report
 * - error → automatic fallback via POST /api/play/:playId/fallback
 * - ended → endPlay(completed) → advance the queue
 */
export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const option = usePlayerStore((s) => s.option);
  const playId = usePlayerStore((s) => s.playId);
  const status = usePlayerStore((s) => s.status);
  const isPaused = usePlayerStore((s) => s.isPaused);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const seekRatio = usePlayerStore((s) => s.seekRatio);
  const lastReportRef = useRef(0);

  const url = currentAudioUrl(option);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (url && status === 'playing') {
      if (audio.src !== new URL(url, window.location.origin).toString()) {
        audio.src = url;
      }
      if (isPaused) {
        audio.pause();
      } else {
        void audio.play().catch(() => {
          // autoplay blocked — surface by pausing so user can click play again
          usePlayerStore.getState().togglePause();
        });
      }
    } else {
      audio.pause();
      if (!url) audio.removeAttribute('src');
    }
  }, [url, status, isPaused]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekRatio == null || !Number.isFinite(audio.duration)) return;
    audio.currentTime = seekRatio * audio.duration;
    usePlayerStore.getState().consumeSeek();
  }, [seekRatio]);

  if (!option || option.option.type === 'embed') return null;

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        usePlayerStore.getState().setProgress(
          el.currentTime,
          Number.isFinite(el.duration) ? el.duration : null,
        );
        const now = Date.now();
        const { playId: pid } = usePlayerStore.getState();
        if (pid && now - lastReportRef.current > PROGRESS_REPORT_INTERVAL_MS) {
          lastReportRef.current = now;
          wsClient.sendProgress(pid, el.currentTime, Number.isFinite(el.duration) ? el.duration : undefined);
        }
      }}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        usePlayerStore.getState().setProgress(el.currentTime, Number.isFinite(el.duration) ? el.duration : null);
      }}
      onEnded={() => {
        void usePlayerStore
          .getState()
          .endCurrent('completed')
          .then(() => usePlayerStore.getState().playNextFromQueue());
      }}
      onError={() => {
        if (playId) void usePlayerStore.getState().tryFallback('audio element error');
      }}
    />
  );
}
