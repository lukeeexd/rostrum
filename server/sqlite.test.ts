import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { timeIndexed, transaction } from "./sqlite";

function table() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (at INTEGER PRIMARY KEY)");
  return { db, rows: timeIndexed(db, { table: "t", column: "at", orderBy: "at DESC" }) };
}

describe("timeIndexed", () => {
  it("reads a window in order, reports the oldest row and prunes", () => {
    const { db, rows } = table();
    expect(rows.since()).toBeNull();
    for (const at of [10, 20, 30]) db.prepare("INSERT INTO t VALUES (?)").run(at);
    expect(rows.between(15, 30)).toEqual([{ at: 30 }, { at: 20 }]);
    expect(rows.since()).toBe(10);
    expect(rows.pruneBefore(25)).toBe(2);
    expect(rows.since()).toBe(30);
  });
});

describe("transaction", () => {
  it("commits the work and returns its result", () => {
    const { db, rows } = table();
    expect(transaction(db, () => db.prepare("INSERT INTO t VALUES (1)").run().changes)).toBe(1);
    expect(rows.since()).toBe(1);
  });

  it("rolls back on failure and rethrows the original error", () => {
    const { db, rows } = table();
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO t VALUES (1)").run();
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(rows.since()).toBeNull();
  });

  it("keeps the original error when the rollback fails too", () => {
    const { db } = table();
    expect(() =>
      transaction(db, () => {
        db.exec("COMMIT"); // ends the transaction early, so ROLLBACK will fail
        throw new Error("the real problem");
      }),
    ).toThrow("the real problem");
  });
});
