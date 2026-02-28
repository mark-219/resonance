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

  _updateTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setPlaying: (playing: boolean) => void;
  _setBuffering: (buffering: boolean) => void;
  _setError: (error: string) => void;
  _onTrackEnd: () => void;
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
      onTrackEnd: () => get()._onTrackEnd(),
      onPlayStateChange: (playing) => get()._setPlaying(playing),
      onBufferingChange: (buffering) => get()._setBuffering(buffering),
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

  next: () => {
    const { audioController, queue, queueIndex } = get();
    if (!audioController || queueIndex >= queue.length - 1) return;

    const nextIndex = queueIndex + 1;
    set({
      currentTrack: queue[nextIndex],
      queueIndex: nextIndex,
      currentTime: 0,
      error: null,
    });

    audioController.next();
  },

  previous: () => {
    const { audioController, queue, queueIndex, currentTime } = get();
    if (!audioController) return;

    if (currentTime > 3) {
      audioController.previous();
      set({ currentTime: 0 });
      return;
    }

    if (queueIndex > 0) {
      const prevIndex = queueIndex - 1;
      set({
        currentTrack: queue[prevIndex],
        queueIndex: prevIndex,
        currentTime: 0,
        error: null,
      });
      audioController.previous();
    }
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

  _updateTime: (time) => set({ currentTime: time }),
  _setDuration: (duration) => set({ duration }),
  _setPlaying: (playing) => {
    set({ isPlaying: playing });
    get().audioController?.updatePlaybackState(playing);
  },
  _setBuffering: (buffering) => set({ isBuffering: buffering }),
  _setError: (error) => set({ error }),
  _onTrackEnd: () => {
    const { queue, queueIndex } = get();
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      set({
        currentTrack: queue[nextIndex],
        queueIndex: nextIndex,
        currentTime: 0,
      });
    } else {
      set({ isPlaying: false });
    }
  },
}));
