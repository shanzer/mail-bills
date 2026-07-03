import { describe, expect, it } from "vitest";
import { PipelineScheduler } from "../src/scheduler.js";
import { makeConfig, tempRoot } from "./helpers.js";

describe("pipeline mutex", () => {
  it("rejects a second entrant while the first holds the lock", async () => {
    const scheduler = new PipelineScheduler(makeConfig(tempRoot("mail-bills-sched-")));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = scheduler.runExclusive(async () => { await gate; return "first"; });
    expect(await scheduler.runExclusive(async () => "second")).toBeUndefined();
    expect(scheduler.status().running).toBe(true);
    release();
    expect(await first).toBe("first");
    expect(scheduler.status().running).toBe(false);
  });

  it("releases the lock when the callback throws", async () => {
    const scheduler = new PipelineScheduler(makeConfig(tempRoot("mail-bills-sched-")));
    await expect(scheduler.runExclusive(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await scheduler.runExclusive(async () => "ok")).toBe("ok");
  });
});
