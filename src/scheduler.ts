import type { MailBillsConfig } from "./types.js";
import { processPending, type PendingProcessResult } from "./processor.js";
import { Ledger } from "./ledger.js";
import { configPaths } from "./config.js";
import { purgeExpiredQuarantine } from "./purge.js";

interface SchedulerLogger {
  info(input: Record<string, unknown>, message: string): void;
  error(input: Record<string, unknown>, message: string): void;
  debug(input: Record<string, unknown>, message: string): void;
}

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

  constructor(private readonly config: MailBillsConfig, private readonly logger?: SchedulerLogger) {}

  start(): void {
    if (!this.config.pipelineSchedule.enabled) {
      this.logger?.info({ enabled: false }, "pipeline scheduler disabled");
      return;
    }
    if (this.timer) {
      this.logger?.debug({}, "pipeline scheduler already started");
      return;
    }
    const intervalMs = this.intervalMs();
    this.scheduleNext(intervalMs);
    this.logger?.info({
      intervalMinutes: this.config.pipelineSchedule.intervalMinutes,
      runOnStartup: this.config.pipelineSchedule.runOnStartup,
      nextRunAt: this.nextRunAt
    }, "pipeline scheduler started");
    this.timer = setInterval(() => {
      this.scheduleNext(intervalMs);
      // runNow logs and rethrows internally; swallow the rejection here so a
      // failing scheduled run does not become an unhandled rejection that
      // crashes the process.
      void this.runNow().catch(() => undefined);
    }, intervalMs);
    this.timer.unref?.();
    if (this.config.pipelineSchedule.runOnStartup) void this.runNow().catch(() => undefined);
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

  /**
   * Single mutex for every pipeline entry point (scheduled, live, dry-run,
   * per-batch). Returns undefined when a run is already in progress.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.running) return undefined;
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }

  async runNow(): Promise<PendingProcessResult | undefined> {
    return this.runExclusive(async () => {
      this.lastStartedAt = new Date().toISOString();
      this.lastError = undefined;
      this.logger?.info({ startedAt: this.lastStartedAt }, "pipeline run started");
      try {
        const result = await processPending({
          config: this.config,
          dryRun: false,
          stableDelayMs: this.config.pipelineSchedule.stableDelayMs
        });
        this.lastResult = result;
        this.lastOk = result.errors.length === 0;
        this.logger?.info({ batches: result.batches.length, errors: result.errors.length }, "pipeline run finished");
        try {
          const ledger = new Ledger(configPaths(this.config).ledgerPath);
          ledger.initialize();
          try {
            const purge = purgeExpiredQuarantine({ ledger, config: this.config });
            if (purge.purged.length || purge.errors.length) {
              this.logger?.info({ purged: purge.purged.length, errors: purge.errors.length }, "quarantine purge finished");
            }
          } finally {
            ledger.close();
          }
        } catch (error) {
          this.logger?.error({ error: error instanceof Error ? error.message : String(error) }, "quarantine purge failed");
        }
        return result;
      } catch (error) {
        this.lastOk = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger?.error({ error: this.lastError }, "pipeline run failed");
        throw error;
      } finally {
        this.lastFinishedAt = new Date().toISOString();
      }
    });
  }

  private intervalMs(): number {
    return Math.max(1, this.config.pipelineSchedule.intervalMinutes) * 60 * 1000;
  }

  private scheduleNext(intervalMs: number): void {
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  }
}
