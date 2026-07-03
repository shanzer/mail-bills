import { describe, expect, it, vi } from "vitest";
import { PipelineScheduler } from "../src/scheduler.js";
import { makeConfig, tempRoot } from "./helpers.js";

describe("runOnStartup behavior", () => {
  it("start() fires an immediate run when runOnStartup is true", () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig(tempRoot("mail-bills-sched-startup-"));
      config.pipelineSchedule.enabled = true;
      config.pipelineSchedule.runOnStartup = true;
      const scheduler = new PipelineScheduler(config);
      const runNowSpy = vi.spyOn(scheduler, "runNow").mockResolvedValue(undefined);

      scheduler.start();
      expect(runNowSpy).toHaveBeenCalledTimes(1);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("start() does NOT fire an immediate run when runOnStartup is false", () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig(tempRoot("mail-bills-sched-nostartup-"));
      config.pipelineSchedule.enabled = true;
      config.pipelineSchedule.runOnStartup = false;
      const scheduler = new PipelineScheduler(config);
      const runNowSpy = vi.spyOn(scheduler, "runNow").mockResolvedValue(undefined);

      scheduler.start();
      expect(runNowSpy).not.toHaveBeenCalled();

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconfigure() does NOT fire an immediate run even when runOnStartup is true", () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig(tempRoot("mail-bills-sched-recfg-"));
      config.pipelineSchedule.enabled = true;
      config.pipelineSchedule.runOnStartup = true;
      const scheduler = new PipelineScheduler(config);
      const runNowSpy = vi.spyOn(scheduler, "runNow").mockResolvedValue(undefined);

      // Start first so the timer is running, then simulate a config change
      scheduler.start();
      expect(runNowSpy).toHaveBeenCalledTimes(1); // runOnStartup fires on boot

      runNowSpy.mockClear();
      config.pipelineSchedule.intervalMinutes = 60; // mutate config (API call scenario)
      scheduler.reconfigure();

      // The immediate run must NOT fire — runOnStartup is for boot only
      expect(runNowSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconfigure() re-arms the timer so status reflects the new interval", () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig(tempRoot("mail-bills-sched-rearm-"));
      config.pipelineSchedule.enabled = true;
      config.pipelineSchedule.runOnStartup = false;
      config.pipelineSchedule.intervalMinutes = 180;
      const scheduler = new PipelineScheduler(config);
      vi.spyOn(scheduler, "runNow").mockResolvedValue(undefined);

      scheduler.start();
      const nextRunAfterStart = scheduler.status().nextRunAt;
      expect(scheduler.status().enabled).toBe(true);
      expect(nextRunAfterStart).toBeDefined();

      config.pipelineSchedule.intervalMinutes = 30;
      scheduler.reconfigure();

      // Timer should be re-armed; nextRunAt should reflect ~30 min from now
      const nextRunAfterRecfg = scheduler.status().nextRunAt;
      expect(scheduler.status().enabled).toBe(true);
      expect(nextRunAfterRecfg).toBeDefined();
      // 30-min window is strictly shorter than 180-min, so the re-armed
      // nextRunAt must be earlier (or equal in the extreme edge) than the
      // original 180-min one.
      expect(new Date(nextRunAfterRecfg!).getTime()).toBeLessThan(
        new Date(nextRunAfterStart!).getTime()
      );

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

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
