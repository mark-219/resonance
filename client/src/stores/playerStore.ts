import { create } from 'zustand';
import { AudioController } from '@/audio/AudioController';

export interface PlayerTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  bitDepth?: number;
  coverArtPath?: string;
}

interface PlayerState {
  currentTrack: PlayerTrack | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  error: string | null;

  queue: PlayerTrack[];
  queueIndex: number;

  audioController: AudioController | null;

  initAudio: () => AudioController;

  playTrack: (track: PlayerTrack, queue: PlayerTrack[], startIndex: number) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // Internal callbacks from AudioController (single source of truth)
  _updateTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setPlaying: (playing: boolean) => void;
  _setBuffering: (buffering: boolean) => void;
  _onTrackChange: (track: PlayerTrack, queueIndex: number) => void;
  _onQueueEnd: () => void;
  _setError: (error: string) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  error: null,
  queue: [],
  queueIndex: -1,
  audioController: null,

  initAudio: () => {
    const existing = get().audioController;
    if (existing) return existing;

    const controller = new AudioController({
      onTimeUpdate: (time) => get()._updateTime(time),
      onDurationChange: (dur) => get()._setDuration(dur),
      onTrackChange: (track, idx) => get()._onTrackChange(track as PlayerTrack, idx),
      onPlayStateChange: (playing) => get()._setPlaying(playing),
      onBufferingChange: (buffering) => get()._setBuffering(buffering),
      onQueueEnd: () => get()._onQueueEnd(),
      onError: (err) => get()._setError(err),
    });

    controller.setVolume(get().volume);
    set({ audioController: controller });
    return controller;
  },

  playTrack: (track, queue, startIndex) => {
    const { audioController } = get();
    if (!audioController) return;

    set({
      currentTrack: track,
      queue,
      queueIndex: startIndex,
      isPlaying: true,
      currentTime: 0,
      error: null,
    });

    audioController.play(track, queue, startIndex);
  },

  pause: () => {
    get().audioController?.pause();
  },

  resume: () => {
    get().audioController?.resume();
  },

  // Delegate to AudioController — it will call back via onTrackChange
  next: () => {
    get().audioController?.next();
  },

  // Delegate to AudioController — it will call back via onTrackChange
  previous: () => {
    get().audioController?.previous();
  },

  seek: (time) => {
    get().audioController?.seek(time);
    set({ currentTime: time });
  },

  setVolume: (volume) => {
    const { audioController } = get();
    set({ volume, isMuted: false });
    if (audioController) {
      audioController.setVolume(volume);
    }
  },

  toggleMute: () => {
    const { isMuted, volume, audioController } = get();
    const newMuted = !isMuted;
    set({ isMuted: newMuted });
    if (audioController) {
      audioController.setVolume(newMuted ? 0 : volume);
    }
  },

  // ─── Internal callbacks (AudioController is source of truth) ────

  _updateTime: (time) => set({ currentTime: time }),
  _setDuration: (duration) => set({ duration }),
  _setPlaying: (playing) => {
    set({ isPlaying: playing });
    get().audioController?.updatePlaybackState(playing);
  },
  _setBuffering: (buffering) => set({ isBuffering: buffering }),
  _onTrackChange: (track, queueIndex) =>
    set({ currentTrack: track, queueIndex, currentTime: 0, error: null }),
  _onQueueEnd: () => set({ isPlaying: false }),
  _setError: (error) => set({ error }),
}));
