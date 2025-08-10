import { EventEmitter } from 'events';

const emitter = new EventEmitter();

export type ProgressEvent = {
  jobId: string;
  progress: number; // 0..100 or -1 for failed
  status: string; // waiting|progress|completed|failed
  message?: string | null;
};

export function emitProgress(evt: ProgressEvent) {
  emitter.emit('progress', evt);
}

export function onProgress(listener: (evt: ProgressEvent) => void) {
  emitter.on('progress', listener);
}

export function offProgress(listener: (evt: ProgressEvent) => void) {
  emitter.off('progress', listener);
} 