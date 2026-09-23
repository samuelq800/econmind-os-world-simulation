import type { PrototypeWorldBriefProjection } from './contracts.js';

export type PrototypeStateName =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'stale'
  | 'unauthorized'
  | 'offline'
  | 'retrying';

export type PrototypeViewState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready' | 'empty' | 'stale';
      readonly projection: PrototypeWorldBriefProjection;
    }
  | {
      readonly status: 'unauthorized';
      readonly reason: string;
    }
  | {
      readonly status: 'offline' | 'retrying';
      readonly projection: PrototypeWorldBriefProjection | null;
      readonly reason: string;
    };

export function readableProjection(
  state: PrototypeViewState,
): PrototypeWorldBriefProjection | null {
  if (
    state.status === 'ready' ||
    state.status === 'empty' ||
    state.status === 'stale' ||
    state.status === 'offline' ||
    state.status === 'retrying'
  ) {
    return state.projection;
  }
  return null;
}

export function nextEventIndex(
  currentIndex: number,
  eventCount: number,
  key: string,
): number {
  if (eventCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return eventCount - 1;
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return (currentIndex + 1) % eventCount;
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return (currentIndex - 1 + eventCount) % eventCount;
  }
  return currentIndex;
}
