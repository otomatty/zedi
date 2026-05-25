/**
 * `plan_maintenance` — aggregates scan results into a single plan object.
 */
import type { WikiMaintenanceStateType, WikiMaintenanceStateUpdate } from "../state.js";
import type { MaintenancePlan } from "../types.js";

export async function planMaintenance(
  state: WikiMaintenanceStateType,
): Promise<WikiMaintenanceStateUpdate> {
  const findings = [...state.brokenLinkFindings, ...state.stubPageFindings];
  const plan: MaintenancePlan = {
    brokenLinkCount: state.brokenLinkFindings.length,
    stubPageCount: state.stubPageFindings.length,
    findings,
    plannedAt: new Date().toISOString(),
  };
  return {
    maintenancePlan: plan,
    phase: "maintenance:planned",
  };
}
