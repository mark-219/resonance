import { create } from 'zustand';

interface Track {
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
  // Current playback
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;

  // Queue
  queue: Track[];
  queueIndex: number;

  // Actions
  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  updateTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  queue: [],
  queueIndex: -1,

  play: (track) =>
    set({ currentTrack: track, isPlaying: true, currentTime: 0 }),

  pause: () => set({ isPlaying: false }),

  resume: () => set({ isPlaying: true }),

  next: () => {
    const { queue, queueIndex } = get();
    if (queueIndex < queue.length - 1) {
      const nextIndex = queueIndex + 1;
      set({
        currentTrack: queue[nextIndex],
        queueIndex: nextIndex,
        isPlaying: true,
        currentTime: 0,
      });
    }
  },

  previous: () => {
    const { queue, queueIndex, currentTime } = get();
    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }
    if (queueIndex > 0) {
      const prevIndex = queueIndex - 1;
      set({
        currentTrack: queue[prevIndex],
        queueIndex: prevIndex,
        isPlaying: true,
        currentTime: 0,
      });
    }
  },

  seek: (time) => set({ currentTime: time }),

  setVolume: (volume) => set({ volume, isMuted: false }),

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

  setQueue: (tracks, startIndex = 0) =>
    set({
      queue: tracks,
      queueIndex: startIndex,
      currentTrack: tracks[startIndex] ?? null,
      isPlaying: true,
      currentTime: 0,
    }),

  addToQueue: (track) =>
    set((s) => ({ queue: [...s.queue, track] })),

  updateTime: (time) => set({ currentTime: time }),

  setDuration: (duration) => set({ duration }),
}));
