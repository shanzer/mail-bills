import type { MailBillsConfig } from "./types.js";
import { processPending, type PendingProcessResult } from "./processor.js";

export interface PipelineSchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  running: boolean;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastOk?: boolean;
  lastError?: string;
  lastResult?: PendingProcessResult;
  nextRunAt?: string;
}

export class PipelineScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastOk?: boolean;
  private lastError?: string;
  private lastResult?: PendingProcessResult;
  private nextRunAt?: string;

  constructor(private readonly config: MailBillsConfig) {}

  start(): void {
    if (!this.config.pipelineSchedule.enabled || this.timer) return;
    const intervalMs = this.intervalMs();
    this.scheduleNext(intervalMs);
    this.timer = setInterval(() => {
      this.scheduleNext(intervalMs);
      void this.runNow();
    }, intervalMs);
    this.timer.unref?.();
    if (this.config.pipelineSchedule.runOnStartup) void this.runNow();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.nextRunAt = undefined;
  }

  status(): PipelineSchedulerStatus {
    return {
      enabled: this.config.pipelineSchedule.enabled,
      intervalMinutes: this.config.pipelineSchedule.intervalMinutes,
      runOnStartup: this.config.pipelineSchedule.runOnStartup,
      running: this.running,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastOk: this.lastOk,
      lastError: this.lastError,
      lastResult: this.lastResult,
      nextRunAt: this.nextRunAt
    };
  }

  async runNow(): Promise<PendingProcessResult | undefined> {
    if (this.running) return undefined;
    this.running = true;
    this.lastStartedAt = new Date().toISOString();
    this.lastError = undefined;
    try {
      const result = await processPending({
        config: this.config,
        dryRun: false,
        stableDelayMs: this.config.pipelineSchedule.stableDelayMs
      });
      this.lastResult = result;
      this.lastOk = result.errors.length === 0;
      return result;
    } catch (error) {
      this.lastOk = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.running = false;
      this.lastFinishedAt = new Date().toISOString();
    }
  }

  private intervalMs(): number {
    return Math.max(1, this.config.pipelineSchedule.intervalMinutes) * 60 * 1000;
  }

  private scheduleNext(intervalMs: number): void {
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  }
}
