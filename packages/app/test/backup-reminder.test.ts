import { describe, expect, test } from "vitest";
import { BackupReminders, REMINDER_PERIOD_DAYS, type KeyValueStorage } from "../src/backupReminder";

const DAY = 24 * 60 * 60 * 1000;

/** A clock to move by hand, and storage that is a map. */
function setup(storage: KeyValueStorage | null = memory()) {
  let now = Date.UTC(2026, 9, 1, 12);
  const reminders = new BackupReminders(storage, () => now);
  return { reminders, storage, later: (days: number) => void (now += days * DAY) };
}
function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("when a backup is due", () => {
  test("not for a project it has never seen, and not for one that has just been opened", () => {
    const { reminders } = setup();
    expect(reminders.isDue("p")).toBe(false);
    reminders.noteOpened("p");
    expect(reminders.isDue("p")).toBe(false);
  });

  test("a whole period after the changes that are in no backup began", () => {
    const { reminders, later } = setup();
    reminders.noteOpened("p");
    later(REMINDER_PERIOD_DAYS - 0.01);
    expect(reminders.isDue("p")).toBe(false);
    later(0.02);
    expect(reminders.isDue("p")).toBe(true);
    expect(reminders.daysUnbacked("p")).toBe(REMINDER_PERIOD_DAYS);
  });

  test("a backup clears it, and it starts again from the next change", () => {
    const { reminders, later } = setup();
    reminders.noteOpened("p");
    later(10);
    expect(reminders.isDue("p")).toBe(true);
    reminders.noteBackup("p");
    expect(reminders.isDue("p")).toBe(false);
    expect(reminders.daysUnbacked("p")).toBeNull();
    later(30); // a month of not touching it: nothing is waiting
    expect(reminders.isDue("p")).toBe(false);
    reminders.noteChange("p");
    later(REMINDER_PERIOD_DAYS - 1);
    expect(reminders.isDue("p")).toBe(false);
    later(1);
    expect(reminders.isDue("p")).toBe(true);
  });

  test("more changes do not move the start: it counts from the first change that is in no backup", () => {
    const { reminders, later } = setup();
    reminders.noteBackup("p");
    reminders.noteChange("p");
    later(5);
    reminders.noteChange("p");
    later(2);
    expect(reminders.isDue("p")).toBe(true);
  });

  test("dismissing hides it for another whole period, and then it comes back", () => {
    const { reminders, later } = setup();
    reminders.noteOpened("p");
    later(8);
    expect(reminders.isDue("p")).toBe(true);
    reminders.dismiss("p");
    expect(reminders.isDue("p")).toBe(false);
    later(REMINDER_PERIOD_DAYS - 0.01);
    expect(reminders.isDue("p")).toBe(false);
    later(0.02);
    expect(reminders.isDue("p")).toBe(true);
  });

  test("a backup after dismissing also clears it", () => {
    const { reminders, later } = setup();
    reminders.noteOpened("p");
    later(8);
    reminders.dismiss("p");
    reminders.noteBackup("p");
    later(20);
    expect(reminders.isDue("p")).toBe(false);
    expect(reminders.state("p").dismissedAt).toBeUndefined();
  });

  test("projects are separate", () => {
    const { reminders, later } = setup();
    reminders.noteOpened("a");
    later(4);
    reminders.noteOpened("b");
    later(4);
    expect([reminders.isDue("a"), reminders.isDue("b")]).toEqual([true, false]);
    reminders.noteBackup("a");
    expect(reminders.state("a").lastBackupAt).toBeDefined();
    expect(reminders.state("b").lastBackupAt).toBeUndefined();
  });

  test("a deleted project is forgotten", () => {
    const { reminders, storage } = setup();
    reminders.noteOpened("p");
    reminders.forget("p");
    expect(reminders.state("p")).toEqual({});
    expect((storage as ReturnType<typeof memory>).data.size).toBe(0);
  });
});

describe("keeping it", () => {
  test("it survives a reload: a new instance on the same storage knows", () => {
    const storage = memory();
    const a = setup(storage);
    a.reminders.noteOpened("p");
    a.later(8);
    const again = new BackupReminders(storage, () => Date.UTC(2026, 9, 1, 12) + 8 * DAY);
    expect(again.isDue("p")).toBe(true);
    again.dismiss("p");
    expect(new BackupReminders(storage, () => Date.UTC(2026, 9, 1, 12) + 8 * DAY).isDue("p")).toBe(false);
  });

  test("when the browser will not store anything it still works until the page is closed", () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const { reminders, later } = setup(blocked);
    reminders.noteOpened("p");
    later(8);
    expect(reminders.isDue("p")).toBe(true);
    reminders.dismiss("p");
    expect(reminders.isDue("p")).toBe(false);
  });

  test("with no storage at all it works the same", () => {
    const { reminders, later } = setup(null);
    reminders.noteOpened("p");
    later(8);
    expect(reminders.isDue("p")).toBe(true);
  });

  test("something unreadable in storage is ignored", () => {
    const storage = memory();
    storage.setItem("rosetta.backup.p", "{not json");
    const { reminders } = setup(storage);
    expect(reminders.isDue("p")).toBe(false);
    reminders.noteOpened("p"); // and it starts over
    expect(reminders.state("p").unbackedSince).toBeDefined();
    storage.setItem("rosetta.backup.q", "42");
    expect(setup(storage).reminders.isDue("q")).toBe(false);
  });
});
