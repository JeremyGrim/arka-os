import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LogService } from "../../src/services/logService";
import { ObservabilityService } from "../../src/services/observabilityService";

describe("ObservabilityService", () => {
  it("compte les événements notification.* dès la première occurrence", async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), "observability-test-"));
    const logService = new LogService(path.join(baseDir, "logs"));
    await logService.init();
    const observability = new ObservabilityService(path.join(baseDir, "observability"), logService);
    await observability.init();

    logService.info("notification.queued delivery=DELIV-1 session=SESSION-1", "session-notify", "SESSION-1");
    logService.warn("notification.failed delivery=DELIV-1 session=SESSION-1", "session-notify", "SESSION-1");

    const summary = observability.getNotificationSummary();
    expect(summary.counts.queued).toBe(1);
    expect(summary.counts.failed).toBe(1);
    expect(summary.lastEvents.at(-1)?.type).toBe("failed");
  });
});
