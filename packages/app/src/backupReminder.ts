/**
 * When to remind a person to export a backup. Projects live only in this browser, which can lose them (cleared site data,
 * a reset profile), and a `.rosetta` file is the copy outside it.
 *
 * Per project it keeps: when a backup was last made, since when there have been changes that are in no backup, and when the
 * reminder was last dismissed. The reminder is due once a whole period has passed since the later of the first unbacked change
 * and the last dismissal, so it comes back after a period if nothing is done, and never while a backup is up to date.
 */

/** Days of changes without a backup before the first reminder, and between reminders. */
export const REMINDER_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupState {
  /** When a backup was last made (exported, or imported from a file), as an ISO time. */
  lastBackupAt?: string;
  /** Since when there have been changes that are in no backup. */
  unbackedSince?: string;
  /** When the reminder was last dismissed. */
  dismissedAt?: string;
}

/** What it needs of `localStorage`. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const keyFor = (projectId: string) => `rosetta.backup.${projectId}`;

export class BackupReminders {
  private fallback = new Map<string, string>();

  constructor(
    private storage: KeyValueStorage | null = safeLocalStorage(),
    private now: () => number = Date.now,
    private periodMs = REMINDER_PERIOD_DAYS * DAY_MS,
  ) {}

  private read(projectId: string): BackupState {
    let text: string | null = null;
    try {
      text = this.storage?.getItem(keyFor(projectId)) ?? null;
    } catch {
      // blocked: what was kept in memory is all there is
    }
    text ??= this.fallback.get(keyFor(projectId)) ?? null;
    try {
      const state: unknown = text ? JSON.parse(text) : {};
      return state && typeof state === "object" ? (state as BackupState) : {};
    } catch {
      return {}; // unreadable: start over
    }
  }

  private write(projectId: string, state: BackupState) {
    const text = JSON.stringify(state);
    this.fallback.set(keyFor(projectId), text); // kept in memory too, for when the browser will not store it
    try {
      this.storage?.setItem(keyFor(projectId), text);
    } catch {
      // storage is full or blocked: the reminder then lasts until the page is closed
    }
  }

  private at = () => new Date(this.now()).toISOString();

  state(projectId: string): BackupState {
    return this.read(projectId);
  }

  /** The project has been opened. A project never seen before counts as having changes that are in no backup, from now. */
  noteOpened(projectId: string): void {
    const state = this.read(projectId);
    if (!state.lastBackupAt && !state.unbackedSince) this.write(projectId, { ...state, unbackedSince: this.at() });
  }

  /** Something in the project changed. Starts the clock if there was none (the project was backed up before this). */
  noteChange(projectId: string): void {
    const state = this.read(projectId);
    if (!state.unbackedSince) this.write(projectId, { ...state, unbackedSince: this.at() });
  }

  /** A backup was made: everything is in it, so nothing is waiting any more. */
  noteBackup(projectId: string): void {
    this.write(projectId, { lastBackupAt: this.at() });
  }

  /** The person said not now. The reminder is not shown again for another period. */
  dismiss(projectId: string): void {
    this.write(projectId, { ...this.read(projectId), dismissedAt: this.at() });
  }

  /** The project is forgotten (it was deleted). */
  forget(projectId: string): void {
    this.fallback.delete(keyFor(projectId));
    try {
      this.storage?.removeItem?.(keyFor(projectId));
    } catch {
      // nothing to do
    }
  }

  /** Whole days since the changes that are in no backup began, if there are any. */
  daysUnbacked(projectId: string): number | null {
    const { unbackedSince } = this.read(projectId);
    return unbackedSince ? Math.floor((this.now() - Date.parse(unbackedSince)) / DAY_MS) : null;
  }

  /** Whether to show the reminder now. */
  isDue(projectId: string): boolean {
    const { unbackedSince, dismissedAt } = this.read(projectId);
    if (!unbackedSince) return false;
    const from = Math.max(Date.parse(unbackedSince), dismissedAt ? Date.parse(dismissedAt) : 0);
    return this.now() - from >= this.periodMs;
  }
}

function safeLocalStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked
  }
}

/** The reminders the app uses, kept in this browser's local storage. */
export const backupReminders = new BackupReminders();
