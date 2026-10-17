interface Props {
  title: string;
  /** Whole days since the changes that are in no backup began. */
  days: number;
  lastBackupAt?: string;
  busy?: boolean;
  onExport: () => void;
  onDismiss: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** A gentle reminder under the top bar to save a backup: this browser is the only place the project is kept. */
export function BackupBanner({ title, days, lastBackupAt, busy, onExport, onDismiss }: Props) {
  return (
    <aside className="backup-reminder" role="region" aria-label="Backup reminder">
      <p>
        <strong>Back up “{title}”?</strong> It has been {days === 1 ? "a day" : `${days} days`} since it last changed without a backup, and it is kept only in this browser.{" "}
        {lastBackupAt ? `Last backup: ${when(lastBackupAt)}.` : "There is no backup yet."} A .rosetta file is a copy you can keep anywhere.
      </p>
      <button type="button" onClick={onExport} disabled={busy}>
        {busy ? "Exporting…" : "Export a backup"}
      </button>
      <button type="button" onClick={onDismiss}>
        Not now
      </button>
    </aside>
  );
}
