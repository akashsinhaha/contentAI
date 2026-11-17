import cron from "node-cron";
import { publishDueContent } from "@/lib/content";
import { processDueFollowUps } from "@/lib/customer";

/** Runs one pass of all periodic jobs. Also exposed via /api/cron for manual or external triggering. */
export async function runScheduledJobs(now = new Date()) {
  const published = await publishDueContent(now);
  const followUps = await processDueFollowUps(now);
  return { published, followUps };
}

const globalForScheduler = globalThis as unknown as { schedulerStarted?: boolean };

export function startScheduler() {
  if (globalForScheduler.schedulerStarted) return;
  globalForScheduler.schedulerStarted = true;
  cron.schedule("* * * * *", () => {
    runScheduledJobs().catch((error) => console.error("scheduler error", error));
  });
}
