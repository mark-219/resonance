interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  format: string;
  coverArtPath?: string;
}

interface AudioCallbacks {
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onTrackChange: (track: Track, queueIndex: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onBufferingChange: (buffering: boolean) => void;
  onQueueEnd: () => void;
  onError: (error: string) => void;
}

const PRELOAD_THRESHOLD_SECONDS = 10;

export class AudioController {
  private primary: HTMLAudioElement;
  private preload: HTMLAudioElement;
  private primaryAbort: AbortController;
  private callbacks: AudioCallbacks;
  private queue: Track[] = [];
  private queueIndex = -1;
  private preloadedIndex = -1;
  private consecutiveErrors = 0;
  private mediaSessionRegistered = false;

  constructor(callbacks: AudioCallbacks) {
    this.callbacks = callbacks;
    this.primary = new Audio();
    this.preload = new Audio();
    this.primary.preload = 'auto';
    this.preload.preload = 'auto';

    this.primaryAbort = new AbortController();
    this.attachListeners(this.primary, this.primaryAbort.signal);
  }

  private streamUrl(trackId: string): string {
    return `/api/stream/${trackId}`;
  }

  private attachListeners(el: HTMLAudioElement, signal: AbortSignal): void {
    el.addEventListener('timeupdate', () => {
      this.callbacks.onTimeUpdate(el.currentTime);
      this.maybePreloadNext();
    }, { signal });

    el.addEventListener('durationchange', () => {
      if (el.duration && isFinite(el.duration)) {
        this.callbacks.onDurationChange(el.duration);
      }
    }, { signal });

    el.addEventListener('play', () => this.callbacks.onPlayStateChange(true), { signal });
    el.addEventListener('pause', () => this.callbacks.onPlayStateChange(false), { signal });
    el.addEventListener('waiting', () => this.callbacks.onBufferingChange(true), { signal });
    el.addEventListener('playing', () => this.callbacks.onBufferingChange(false), { signal });

    el.addEventListener('ended', () => this.handleTrackEnd(), { signal });

    el.addEventListener('error', () => {
      const err = el.error?.message || 'Playback error';
      this.callbacks.onError(err);
      this.consecutiveErrors++;

      if (this.consecutiveErrors < 2) {
        setTimeout(() => this.advanceQueue(), 2000);
      }
    }, { signal });
  }

  private maybePreloadNext(): void {
    const remaining = this.primary.duration - this.primary.currentTime;
    const nextIndex = this.queueIndex + 1;

    if (
      remaining <= PRELOAD_THRESHOLD_SECONDS &&
      remaining > 0 &&
      nextIndex < this.queue.length &&
      nextIndex !== this.preloadedIndex
    ) {
      this.preload.src = this.streamUrl(this.queue[nextIndex].id);
      this.preload.load();
      this.preloadedIndex = nextIndex;
    }
  }

  private handleTrackEnd(): void {
    this.advanceQueue();
  }

  private advanceQueue(): void {
    const nextIndex = this.queueIndex + 1;
    if (nextIndex >= this.queue.length) {
      this.callbacks.onQueueEnd();
      return;
    }

    this.queueIndex = nextIndex;
    const nextTrack = this.queue[nextIndex];

    // Notify store of track change (single source of truth)
    this.callbacks.onTrackChange(nextTrack, nextIndex);

    if (nextIndex === this.preloadedIndex) {
      // Detach listeners from old primary
      this.primaryAbort.abort();

      const oldPrimary = this.primary;
      oldPrimary.pause();
      oldPrimary.removeAttribute('src');
      oldPrimary.load();

      // Swap elements
      this.primary = this.preload;
      this.preload = oldPrimary;

      // Attach fresh listeners to new primary
      this.primaryAbort = new AbortController();
      this.attachListeners(this.primary, this.primaryAbort.signal);

      this.primary.play().then(() => {
        this.consecutiveErrors = 0;
      }).catch(() => {});
    } else {
      this.primary.src = this.streamUrl(nextTrack.id);
      this.primary.play().then(() => {
        this.consecutiveErrors = 0;
      }).catch(() => {});
    }

    this.preloadedIndex = -1;
    this.updateMediaSession(nextTrack);
  }

  play(track: Track, queue: Track[], startIndex: number): void {
    this.queue = queue;
    this.queueIndex = startIndex;
    this.consecutiveErrors = 0;
    this.preloadedIndex = -1;

    this.primary.src = this.streamUrl(track.id);
    this.primary.play().catch(() => {});

    this.updateMediaSession(track);
    this.registerMediaSessionHandlers();
  }

  pause(): void {
    this.primary.pause();
  }

  resume(): void {
    this.primary.play().catch(() => {});
  }

  seek(seconds: number): void {
    this.primary.currentTime = seconds;
  }

  setVolume(level: number): void {
    this.primary.volume = Math.max(0, Math.min(1, level));
    this.preload.volume = this.primary.volume;
  }

  next(): void {
    if (this.queueIndex < this.queue.length - 1) {
      this.advanceQueue();
    }
  }

  previous(): void {
    if (this.primary.currentTime > 3) {
      this.primary.currentTime = 0;
      return;
    }

    if (this.queueIndex > 0) {
      this.queueIndex -= 2; // advanceQueue increments by 1
      this.preloadedIndex = -1;
      this.advanceQueue();
    }
  }

  getCurrentTrack(): Track | null {
    return this.queue[this.queueIndex] ?? null;
  }

  destroy(): void {
    this.primaryAbort.abort();
    this.primary.pause();
    this.primary.removeAttribute('src');
    this.preload.removeAttribute('src');
  }

  // ─── Media Session API ──────────────────────────────────────────

  private registerMediaSessionHandlers(): void {
    if (!('mediaSession' in navigator) || this.mediaSessionRegistered) return;

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) this.seek(details.seekTime);
    });

    this.mediaSessionRegistered = true;
  }

  private updateMediaSession(track: Track): void {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Unknown Album',
      artwork: track.coverArtPath
        ? [{ src: track.coverArtPath, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
  }

  updatePlaybackState(playing: boolean): void {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }
}
