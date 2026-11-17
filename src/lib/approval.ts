import { db } from "@/lib/db";

/**
 * The single choke point for anything public or outbound-in-bulk.
 * Nothing is published, launched or broadcast unless an owner decision passes through decideAction().
 */
export type ActionType = "publish_post" | "launch_campaign" | "send_followup";

export async function requestApproval(input: {
  type: ActionType;
  title: string;
  payload: Record<string, unknown>;
  createdBy?: "marketing" | "customer" | "owner";
}) {
  return db.pendingAction.create({
    data: {
      type: input.type,
      title: input.title,
      payload: JSON.stringify(input.payload),
      createdBy: input.createdBy ?? "marketing",
    },
  });
}

export interface ActionEdits { caption?: string; message?: string; body?: string }

export async function decideAction(actionId: string, approve: boolean, edits: ActionEdits = {}) {
  const action = await db.pendingAction.findUnique({ where: { id: actionId } });
  if (!action) throw new Error("Action not found");
  if (action.status !== "pending") throw new Error(`Action already ${action.status}`);
  const payload = JSON.parse(action.payload) as Record<string, string>;

  if (!approve) {
    await rejectEntity(action.type as ActionType, payload);
    return db.pendingAction.update({ where: { id: actionId }, data: { status: "rejected", decidedAt: new Date() } });
  }

  // Claim the action first so a double click cannot run it twice.
  const claimed = await db.pendingAction.updateMany({ where: { id: actionId, status: "pending" }, data: { status: "approved", decidedAt: new Date() } });
  if (claimed.count === 0) throw new Error("Action was already decided");

  try {
    const result = await executeApproved(action.type as ActionType, payload, edits);
    return db.pendingAction.update({ where: { id: actionId }, data: { result } });
  } catch (error) {
    return db.pendingAction.update({
      where: { id: actionId },
      data: { status: "failed", result: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function executeApproved(type: ActionType, payload: Record<string, string>, edits: ActionEdits): Promise<string> {
  switch (type) {
    case "publish_post": {
      const { approvePost } = await import("@/lib/content");
      return approvePost(payload.contentId, edits.caption);
    }
    case "launch_campaign": {
      const { launchCampaign } = await import("@/lib/campaigns");
      return launchCampaign(payload.campaignId, edits.message);
    }
    case "send_followup": {
      const { sendFollowUp } = await import("@/lib/customer");
      return sendFollowUp(payload.leadId, edits.body ?? payload.body);
    }
    default:
      throw new Error(`Unknown action type ${type}`);
  }
}

async function rejectEntity(type: ActionType, payload: Record<string, string>) {
  if (type === "publish_post") await db.contentItem.update({ where: { id: payload.contentId }, data: { status: "rejected" } });
  if (type === "launch_campaign") await db.campaign.update({ where: { id: payload.campaignId }, data: { status: "rejected" } });
  if (type === "send_followup") {
    const { skipFollowUp } = await import("@/lib/customer");
    await skipFollowUp(payload.leadId);
  }
}
