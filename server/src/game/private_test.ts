import type {
  MetaStatePayload,
  PrivateTestProgressPayload,
  StartPrivateTestPayload,
} from "../ws_protocol";
import type { ActiveAgreement } from "./negotiations";
import { validateFleetRegulations } from "./fleet";
import {
  sanitizeAssignedDriverIds,
  validateExclusiveDriverAssignments,
} from "./driver_catalog";
import { isSeasonCalendarComplete } from "./season_end";
import { appliesWeekendSchedule } from "./weekend_sessions";
import {
  TRACK_CATALOG,
  trackDisplayName,
  WEC_2026_CALENDAR,
} from "./track_catalog";

export const PRIVATE_TEST_MIN_HOURS = 1;
export const PRIVATE_TEST_MAX_HOURS = 72;
export const PRIVATE_TEST_DEFAULT_HOURS = 4;
export const DEFAULT_JOINT_TEST_HOURS_PER_DAY = 24;
export const MIN_JOINT_TEST_HOURS_PER_DAY = 1;
export const MAX_JOINT_TEST_HOURS_PER_DAY = 24;
/** @deprecated Use resolveTestHoursPerDay — legacy saves assumed 8 h/day. */
export const JOINT_TEST_HOURS_PER_DAY = 8;

export type JointTestSessionMode = "continuous" | "per_day";

export interface JointTestSessionSlot {
  sessionIndex: number;
  durationHours: number;
  label: string;
}

export interface JointTestSessionPlan {
  mode: JointTestSessionMode;
  testDays: number;
  testHoursPerDay: number;
  sessions: JointTestSessionSlot[];
  totalHours: number;
}

export function resolveTestHoursPerDay(terms: {
  testHoursPerDay?: number;
}): number {
  const raw = terms.testHoursPerDay;
  if (raw == null || !Number.isFinite(raw)) {
    return DEFAULT_JOINT_TEST_HOURS_PER_DAY;
  }
  return Math.min(
    MAX_JOINT_TEST_HOURS_PER_DAY,
    Math.max(MIN_JOINT_TEST_HOURS_PER_DAY, Math.round(raw)),
  );
}

export function jointTestSessionPlan(agr: ActiveAgreement): JointTestSessionPlan {
  const testDays = Math.max(1, agr.terms.testDays ?? 1);
  const testHoursPerDay = resolveTestHoursPerDay(agr.terms);

  if (testHoursPerDay >= MAX_JOINT_TEST_HOURS_PER_DAY) {
    const durationHours = clampPrivateTestDurationHours(
      testDays * MAX_JOINT_TEST_HOURS_PER_DAY,
    );
    return {
      mode: "continuous",
      testDays,
      testHoursPerDay,
      totalHours: durationHours,
      sessions: [
        {
          sessionIndex: 0,
          durationHours,
          label:
            testDays === 1
              ? "24 h continuous"
              : `${testDays}×24 h continuous`,
        },
      ],
    };
  }

  const sessions = Array.from({ length: testDays }, (_, sessionIndex) => ({
    sessionIndex,
    durationHours: clampPrivateTestDurationHours(testHoursPerDay),
    label: `Day ${sessionIndex + 1}`,
  }));
  return {
    mode: "per_day",
    testDays,
    testHoursPerDay,
    totalHours: testDays * testHoursPerDay,
    sessions,
  };
}

export function formatJointTestPlanSummary(plan: JointTestSessionPlan): string {
  if (plan.mode === "continuous") {
    return `${plan.testDays} day${plan.testDays === 1 ? "" : "s"} · ${plan.sessions[0]!.durationHours} h continuous`;
  }
  return `${plan.testDays} days × ${plan.testHoursPerDay} h/day`;
}

export function jointTestCampaignComplete(
  plan: JointTestSessionPlan,
  progress: PrivateTestProgressPayload,
): boolean {
  return progress.completedSessionIndices.length >= plan.sessions.length;
}

export function nextJointTestSessionIndex(
  plan: JointTestSessionPlan,
  progress?: PrivateTestProgressPayload | null,
): number | null {
  const completed = progress?.completedSessionIndices.length ?? 0;
  if (completed >= plan.sessions.length) return null;
  return completed;
}

export function buildPrivateTestProgress(
  payload: StartPrivateTestPayload,
  plan: JointTestSessionPlan,
): PrivateTestProgressPayload {
  return {
    trackId: payload.trackId,
    carIds: [...payload.carIds],
    driverAssignments: structuredClone(payload.driverAssignments),
    jointAgreementId: payload.jointAgreementId!,
    jointPartnerTeams: [...(payload.jointPartnerTeams ?? [])],
    testDays: plan.testDays,
    testHoursPerDay: plan.testHoursPerDay,
    sessionMode: plan.mode === "continuous" ? "continuous" : "per_day",
    completedSessionIndices: [],
    carSetups: payload.carSetups ? structuredClone(payload.carSetups) : undefined,
  };
}

export function privateTestPayloadFromProgress(
  progress: PrivateTestProgressPayload,
  plan: JointTestSessionPlan,
): StartPrivateTestPayload | null {
  const sessionIndex = nextJointTestSessionIndex(plan, progress);
  if (sessionIndex == null) return null;
  const slot = plan.sessions[sessionIndex];
  if (!slot) return null;
  return {
    trackId: progress.trackId,
    carIds: [...progress.carIds],
    driverAssignments: structuredClone(progress.driverAssignments),
    durationHours: slot.durationHours,
    carSetups: progress.carSetups ? structuredClone(progress.carSetups) : undefined,
    jointAgreementId: progress.jointAgreementId,
    jointPartnerTeams: [...progress.jointPartnerTeams],
  };
}

function teamNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function agreementPartnerTeams(agr: ActiveAgreement): string[] {
  const fromAgreement = agr.partnerTeams?.filter(Boolean) ?? [];
  if (fromAgreement.length) {
    return [...fromAgreement].sort((a, b) => a.localeCompare(b));
  }
  const fromTerms = agr.terms.partnerTeams?.filter(Boolean) ?? [];
  if (fromTerms.length) {
    return [...fromTerms].sort((a, b) => a.localeCompare(b));
  }
  return agr.partnerTeam ? [agr.partnerTeam] : [];
}

function partnerTeamSetKey(teams: string[]): string {
  return [...teams]
    .map(teamNameKey)
    .filter(Boolean)
    .sort()
    .join("|");
}

export interface JointTestingPartnerGroup {
  key: string;
  partners: string[];
  agreements: ActiveAgreement[];
}

export function jointTestingPartnerGroupKey(partners: string[]): string {
  return partnerTeamSetKey(partners);
}

export function pendingJointTestingPartnerGroups(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): JointTestingPartnerGroup[] {
  const groups = new Map<string, JointTestingPartnerGroup>();
  for (const agr of pendingJointTestingBundles(meta, currentRound)) {
    const partners = agreementPartnerTeams(agr);
    const key = jointTestingPartnerGroupKey(partners);
    const group = groups.get(key) ?? { key, partners, agreements: [] };
    group.agreements.push(agr);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      agreements: group.agreements.sort(
        (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => a.partners.join(" + ").localeCompare(b.partners.join(" + ")));
}

export function allowedJointTestTrackIdsForGroup(
  group: JointTestingPartnerGroup,
): string[] {
  const tracks = new Set<string>();
  for (const agr of group.agreements) {
    const trackId = agr.terms.sharedTrackId?.trim();
    if (trackId && TRACK_CATALOG[trackId]) tracks.add(trackId);
  }
  return [...tracks].sort((a, b) => a.localeCompare(b));
}

export function pickJointAgreementForGroupAndTrack(
  group: JointTestingPartnerGroup,
  trackId: string,
): ActiveAgreement | null {
  const matches = group.agreements.filter(
    (agr) => agr.terms.sharedTrackId === trackId,
  );
  if (!matches.length) return null;
  return matches.sort(
    (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
  )[0]!;
}

function slugifyTeamName(name: string): string {
  return name.replace(/\s+/g, "-").toLowerCase();
}

function legacyBundleGroupKey(agr: ActiveAgreement): string | null {
  if (agr.kind !== "joint_testing" || agr.id.includes("-bundle-")) return null;
  if (agreementPartnerTeams(agr).length > 1) return null;
  if (!agr.partnerTeam) return null;
  const partnerSlug = slugifyTeamName(agr.partnerTeam);
  const suffix = `-${partnerSlug}`;
  if (!agr.id.endsWith(suffix)) return null;
  const base = agr.id.slice(0, -suffix.length);
  if (!base.startsWith("agr-neg-inter-joint_testing-")) return null;
  return `${base}|${agr.signedRound}|${agr.fulfilledAtRound ?? ""}`;
}

function negotiationSessionRefFromAgreement(agr: ActiveAgreement): string | null {
  const bundleMatch = agr.id.match(/^agr-(neg-inter-joint_testing-.+)-bundle-\d+$/);
  if (bundleMatch) return bundleMatch[1]!;

  const legacyKey = legacyBundleGroupKey(agr);
  if (legacyKey) {
    const baseId = legacyKey.split("|")[0]!;
    return baseId.slice(4);
  }

  return null;
}

function jointTestingDealKey(agr: ActiveAgreement): string {
  const sessionRef = negotiationSessionRefFromAgreement(agr) ?? agr.id;
  return `${sessionRef}|${agr.signedRound}|${agr.fulfilledAtRound ?? ""}`;
}

function pickPreferredJointTestingDuplicate(
  candidates: ActiveAgreement[],
): ActiveAgreement {
  return [...candidates].sort((a, b) => {
    const score = (agr: ActiveAgreement) => {
      let value = 0;
      if (agr.id.includes("-bundle-")) value += 4;
      if ((agr.partnerTeams?.length ?? 0) > 1) value += 2;
      if ((agr.terms.partnerTeams?.length ?? 0) > 1) value += 1;
      return value;
    };
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  })[0]!;
}

function dedupeJointTestingByDealKey(
  agreements: ActiveAgreement[],
): ActiveAgreement[] {
  const passthrough: ActiveAgreement[] = [];
  const jointByDeal = new Map<string, ActiveAgreement>();

  for (const agr of agreements) {
    if (agr.kind !== "joint_testing") {
      passthrough.push(agr);
      continue;
    }
    const key = jointTestingDealKey(agr);
    const existing = jointByDeal.get(key);
    jointByDeal.set(
      key,
      existing ? pickPreferredJointTestingDuplicate([existing, agr]) : agr,
    );
  }

  return [...passthrough, ...jointByDeal.values()];
}

/** Merge legacy per-team rows from one multi-party deal into bundled agreements. */
export function consolidateJointTestingAgreements(
  agreements: ActiveAgreement[],
): ActiveAgreement[] {
  const passthrough: ActiveAgreement[] = [];
  const legacyGroups = new Map<string, ActiveAgreement[]>();

  for (const agr of agreements) {
    if (agr.kind !== "joint_testing") {
      passthrough.push(agr);
      continue;
    }
    const groupKey = legacyBundleGroupKey(agr);
    if (!groupKey) {
      passthrough.push(agr);
      continue;
    }
    const list = legacyGroups.get(groupKey) ?? [];
    list.push(agr);
    legacyGroups.set(groupKey, list);
  }

  const bundled: ActiveAgreement[] = [];
  const passthroughDealKeys = new Set(
    passthrough.map((agr) => jointTestingDealKey(agr)),
  );

  for (const [groupKey, group] of legacyGroups) {
    if (group.length === 1) {
      passthrough.push(group[0]!);
      continue;
    }

    const partners = [
      ...new Set(group.map((agr) => agr.partnerTeam).filter(Boolean) as string[]),
    ].sort((a, b) => a.localeCompare(b));
    const template = group.sort(
      (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
    )[0]!;
    const baseId = groupKey.split("|")[0]!;
    const fulfilledAtRound = group.every((agr) => agr.fulfilledAtRound)
      ? group.find((agr) => agr.fulfilledAtRound)?.fulfilledAtRound
      : undefined;

    const candidate: ActiveAgreement = {
      ...template,
      id: `${baseId}-bundle-${template.signedRound}`,
      partnerTeam: partners[0],
      partnerTeams: partners.length > 1 ? partners : undefined,
      terms: {
        ...template.terms,
        partnerTeam: partners[0],
        partnerTeams: partners.length > 1 ? partners : undefined,
      },
      fulfilledAtRound,
      stubNote:
        partners.length > 1
          ? `Joint private testing with ${partners.join(" + ")} — all partners must join the same session`
          : template.stubNote,
    };

    if (passthroughDealKeys.has(jointTestingDealKey(candidate))) {
      continue;
    }

    bundled.push(candidate);
  }

  return dedupeJointTestingByDealKey([...passthrough, ...bundled]);
}

export function isJointTestingAgreementPending(
  agr: ActiveAgreement,
  currentRound = 0,
): boolean {
  return (
    agr.kind === "joint_testing" &&
    agreementPartnerTeams(agr).length > 0 &&
    !agr.fulfilledAtRound &&
    currentRound <= agr.expiresAtRound
  );
}

export function activeJointTestingAgreements(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): ActiveAgreement[] {
  return consolidateJointTestingAgreements(meta.activeAgreements ?? []).filter(
    (agr) => isJointTestingAgreementPending(agr, currentRound),
  );
}

export function pendingJointTestingBundles(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): ActiveAgreement[] {
  return activeJointTestingAgreements(meta, currentRound).sort(
    (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
  );
}

export function activeJointTestingPartners(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): string[] {
  const partners = new Set<string>();
  for (const agr of pendingJointTestingBundles(meta, currentRound)) {
    for (const team of agreementPartnerTeams(agr)) {
      partners.add(team);
    }
  }
  return [...partners].sort((a, b) => a.localeCompare(b));
}

export function jointTestDefaultsForAgreement(
  agreement: ActiveAgreement,
): {
  trackId?: string;
  durationHours?: number;
  plan: JointTestSessionPlan;
} {
  const plan = jointTestSessionPlan(agreement);
  const sessionIndex = 0;
  return {
    trackId: agreement.terms.sharedTrackId,
    durationHours: plan.sessions[sessionIndex]?.durationHours,
    plan,
  };
}

export function fulfillJointTestingAgreement(
  agreements: ActiveAgreement[],
  agreementId: string,
  fulfillingRound: number,
): ActiveAgreement[] {
  const consolidated = consolidateJointTestingAgreements(agreements);
  return consolidated.map((agr) =>
    agr.id === agreementId && !agr.fulfilledAtRound
      ? { ...agr, fulfilledAtRound: fulfillingRound }
      : agr,
  );
}

export function resolveJointTestSelection(
  meta: MetaStatePayload,
  agreementId?: string,
): { agreement?: ActiveAgreement; partnerTeams: string[]; error?: string } {
  if (!agreementId) {
    return { partnerTeams: [] };
  }

  const agreement = pendingJointTestingBundles(meta).find(
    (agr) => agr.id === agreementId,
  );
  if (!agreement) {
    return { partnerTeams: [], error: "Joint-testing agreement is no longer pending" };
  }

  return { agreement, partnerTeams: agreementPartnerTeams(agreement) };
}

export function validateJointTestingSelection(
  meta: MetaStatePayload,
  agreementId?: string,
  partnerTeams: string[] = [],
): string | null {
  if (!agreementId) {
    if (partnerTeams.length) {
      return "Select a joint-testing agreement — partial partner sessions are not valid";
    }
    return null;
  }

  const resolved = resolveJointTestSelection(meta, agreementId);
  if (resolved.error) return resolved.error;
  if (!resolved.agreement) {
    return "Joint-testing agreement is no longer pending";
  }

  const required = partnerTeamSetKey(resolved.partnerTeams);
  const provided = partnerTeamSetKey(partnerTeams);
  if (required !== provided) {
    const label = resolved.partnerTeams.join(" + ");
    return `This agreement requires all partners together: ${label}`;
  }

  return null;
}

export function clampPrivateTestDurationHours(hours: number): number {
  if (!Number.isFinite(hours)) return PRIVATE_TEST_DEFAULT_HOURS;
  return Math.min(
    PRIVATE_TEST_MAX_HOURS,
    Math.max(PRIVATE_TEST_MIN_HOURS, Math.round(hours)),
  );
}

export function isRaceWeekendInProgress(meta: MetaStatePayload): boolean {
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed) return false;
  if (!appliesWeekendSchedule(current.eventType, current.format)) return false;
  return meta.weekendProgress?.round === meta.currentRound;
}

export function canStartPrivateTest(meta: MetaStatePayload): boolean {
  return privateTestBlockedReason(meta) === null;
}

export function privateTestBlockedReason(meta: MetaStatePayload): string | null {
  if (!meta.setupComplete) return "Complete team setup first";
  if (meta.seasonComplete || isSeasonCalendarComplete(meta.calendar)) {
    return "Season complete — review results and start the next season";
  }
  if (isRaceWeekendInProgress(meta)) {
    return "Finish the race weekend before scheduling a private test";
  }
  if (!meta.fleet?.length) return "Your team needs at least one car";
  return null;
}

function validateDriverAssignments(
  meta: MetaStatePayload,
  carIds: string[],
  driverAssignments: StartPrivateTestPayload["driverAssignments"],
): string | null {
  const roster = meta.driverRoster ?? [];
  const fleetSubset = carIds.map((id) => {
    const car = meta.fleet?.find((c) => c.id === id);
    if (!car) return null;
    const assigned = driverAssignments[id];
    if (!assigned?.length) {
      return { ...car, assignedDriverIds: [] as string[] };
    }
    return { ...car, assignedDriverIds: sanitizeAssignedDriverIds(assigned, roster) };
  });

  if (fleetSubset.some((c) => c === null)) {
    return "One or more selected cars were not found in your fleet";
  }

  return validateExclusiveDriverAssignments(
    fleetSubset.filter((c): c is NonNullable<typeof c> => c !== null),
    roster,
  );
}

export function validatePrivateTestPayload(
  meta: MetaStatePayload,
  raw: StartPrivateTestPayload,
): { payload: StartPrivateTestPayload } | { error: string } {
  const blocked = privateTestBlockedReason(meta);
  if (blocked) return { error: blocked };

  const trackId = String(raw.trackId ?? "").trim();
  if (!trackId || !TRACK_CATALOG[trackId]) {
    return { error: "Select a valid track" };
  }

  const carIds = [...new Set((raw.carIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (!carIds.length) return { error: "Select at least one car" };

  const fleetIds = new Set((meta.fleet ?? []).map((c) => c.id));
  for (const carId of carIds) {
    if (!fleetIds.has(carId)) return { error: `Unknown car: ${carId}` };
  }

  const fleetSubset = (meta.fleet ?? []).filter((c) => carIds.includes(c.id));
  const fleetErr = validateFleetRegulations(fleetSubset);
  if (fleetErr) return { error: fleetErr };

  const driverAssignments = raw.driverAssignments ?? {};
  for (const carId of carIds) {
    if (!driverAssignments[carId]?.length) {
      const car = meta.fleet?.find((c) => c.id === carId);
      return { error: `Assign at least one driver to car #${car?.carNumber ?? carId}` };
    }
  }

  const assignmentKeys = Object.keys(driverAssignments).filter(
    (k) => driverAssignments[k]?.length,
  );
  for (const key of assignmentKeys) {
    if (!carIds.includes(key)) {
      return { error: "Driver assignments must match selected cars only" };
    }
  }

  const assignErr = validateDriverAssignments(meta, carIds, driverAssignments);
  if (assignErr) return { error: assignErr };

  const jointAgreementId = String(raw.jointAgreementId ?? "").trim() || undefined;
  const resolved = resolveJointTestSelection(meta, jointAgreementId);
  if (resolved.error) return { error: resolved.error };

  const jointPartnerTeams = resolved.partnerTeams;
  const selectionErr = validateJointTestingSelection(
    meta,
    jointAgreementId,
    jointPartnerTeams,
  );
  if (selectionErr) return { error: selectionErr };

  let durationHours = clampPrivateTestDurationHours(raw.durationHours);

  if (resolved.agreement) {
    const plan = jointTestSessionPlan(resolved.agreement);
    const progress = meta.privateTestProgress;
    const requiredTrack = resolved.agreement.terms.sharedTrackId?.trim();
    if (requiredTrack && trackId !== requiredTrack) {
      return {
        error: `This joint-testing contract is for ${trackDisplayName(requiredTrack)} only`,
      };
    }

    if (progress && progress.jointAgreementId !== jointAgreementId) {
      return { error: "Finish the in-progress joint test campaign first" };
    }

    if (
      progress &&
      progress.jointAgreementId === jointAgreementId &&
      (progress.trackId !== trackId ||
        progress.jointPartnerTeams.join("|") !== jointPartnerTeams.join("|"))
    ) {
      return { error: "Joint test campaign settings do not match the saved campaign" };
    }

    const sessionIndex = nextJointTestSessionIndex(plan, progress);
    if (sessionIndex == null) {
      return { error: "Joint-testing campaign already complete" };
    }

    const slot = plan.sessions[sessionIndex];
    if (!slot) {
      return { error: "Joint-testing session plan is invalid" };
    }

    durationHours = slot.durationHours;
  } else if (meta.privateTestProgress) {
    return { error: "Finish the in-progress joint test campaign first" };
  }

  return {
    payload: {
      trackId,
      carIds,
      driverAssignments,
      durationHours,
      carSetups: raw.carSetups,
      jointAgreementId,
      jointPartnerTeams: jointPartnerTeams.length ? jointPartnerTeams : undefined,
    },
  };
}

export function trackMonthForPrivateTest(trackId: string): number {
  const event = WEC_2026_CALENDAR.find((e) => e.trackId === trackId);
  return event?.month ?? 6;
}

export function privateTestWeatherSeed(seasonYear: number, trackId: string): number {
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = (hash * 31 + trackId.charCodeAt(i)) | 0;
  }
  return seasonYear * 1000 + Math.abs(hash % 1000);
}

export function collectPrivateTestParticipants(
  meta: MetaStatePayload,
  carIds: string[],
  driverAssignments: StartPrivateTestPayload["driverAssignments"],
): { driverIds: string[]; staffIds: string[] } {
  const driverIds = new Set<string>();
  for (const carId of carIds) {
    for (const id of sanitizeAssignedDriverIds(
      driverAssignments[carId] ?? [],
      meta.driverRoster ?? [],
    )) {
      driverIds.add(id);
    }
  }

  const carIdSet = new Set(carIds);
  const staffIds = (meta.staff ?? [])
    .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  return { driverIds: [...driverIds], staffIds };
}
