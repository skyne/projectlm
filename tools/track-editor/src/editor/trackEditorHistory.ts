import type { TrackJson } from "@server/game/track_json";

const MAX_HISTORY = 64;

export class TrackEditorHistory {
  private undoStack: TrackJson[] = [];
  private redoStack: TrackJson[] = [];

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Push current track onto undo stack before a mutation. */
  record(track: TrackJson): void {
    this.undoStack.push(structuredClone(track));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  /** After a drag gesture, push pre-drag snapshot if the track changed. */
  recordDragIfChanged(before: TrackJson, after: TrackJson): void {
    if (trackSnapshotsEqual(before, after)) return;
    this.undoStack.push(structuredClone(before));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: TrackJson): TrackJson | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(structuredClone(current));
    return prev;
  }

  redo(current: TrackJson): TrackJson | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(structuredClone(current));
    return next;
  }
}

function trackSnapshotsEqual(a: TrackJson, b: TrackJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
