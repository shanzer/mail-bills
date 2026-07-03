import { describe, expect, it } from "vitest";
import { FailedAuthLimiter } from "../src/rate-limit.js";

describe("FailedAuthLimiter", () => {
  it("blocks after maxFailures within the window and unblocks after blockMs", () => {
    let clock = 0;
    const limiter = new FailedAuthLimiter({ maxFailures: 3, windowMs: 1000, blockMs: 5000, now: () => clock });
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    expect(limiter.isBlocked("5.6.7.8")).toBe(false);
    clock = 5001;
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("resets the failure count when the window expires", () => {
    let clock = 0;
    const limiter = new FailedAuthLimiter({ maxFailures: 3, windowMs: 1000, blockMs: 5000, now: () => clock });
    limiter.recordFailure("ip");
    limiter.recordFailure("ip");
    clock = 2000;
    limiter.recordFailure("ip");
    expect(limiter.isBlocked("ip")).toBe(false);
  });

  it("clears an IP on success", () => {
    const limiter = new FailedAuthLimiter({ maxFailures: 2 });
    limiter.recordFailure("ip");
    limiter.recordSuccess("ip");
    limiter.recordFailure("ip");
    expect(limiter.isBlocked("ip")).toBe(false);
  });
});
