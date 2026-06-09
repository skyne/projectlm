import type {
  ActiveAgreementPayload,
  MetaStatePayload,
} from "../ws/protocol";
import { isSeasonFinished } from "./seasonState";
import { weekendScheduleActive } from "./weekendSessions";
import {
  PRIVATE_TEST_DEFAULT_HOURS,
  PRIVATE_TEST_MAX_HOURS,
  PRIVATE_TEST_MIN_HOURS,
} from "../components/privateTestConstants";

export const DEFAULT_JOINT_TEST_HOURS_PER_DAY = 24;
export const MIN_JOINT_TEST_HOURS_PER_DAY = 1;
export const MAX_JOINT_TEST_HOURS_PER_DAY = 24;

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

export function jointTestSessionPlan(
  agr: ActiveAgreementPayload,
): JointTestSessionPlan {
  const testDays = Math.max(1, agr.terms.testDays ?? 1);
  const testHoursPerDay = resolveTestHoursPerDay(agr.terms);

  if (testHoursPerDay >= MAX_JOINT_TEST_HOURS_PER_DAY) {
    const durationHours = Math.min(
      PRIVATE_TEST_MAX_HOURS,
      Math.max(PRIVATE_TEST_MIN_HOURS, testDays * MAX_JOINT_TEST_HOURS_PER_DAY),
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
    durationHours: Math.min(
      PRIVATE_TEST_MAX_HOURS,
      Math.max(PRIVATE_TEST_MIN_HOURS, testHoursPerDay),
    ),
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

export function nextJointTestSessionIndex(
  plan: JointTestSessionPlan,
  progress?: MetaStatePayload["privateTestProgress"],
): number | null {
  const completed = progress?.completedSessionIndices.length ?? 0;
  if (completed >= plan.sessions.length) return null;
  return completed;
}

function teamNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function agreementPartnerTeams(agr: ActiveAgreementPayload): string[] {
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

function slugifyTeamName(name: string): string {
  return name.replace(/\s+/g, "-").toLowerCase();
}

function legacyBundleGroupKey(agr: ActiveAgreementPayload): string | null {
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

function negotiationSessionRefFromAgreement(
  agr: ActiveAgreementPayload,
): string | null {
  const bundleMatch = agr.id.match(/^agr-(neg-inter-joint_testing-.+)-bundle-\d+$/);
  if (bundleMatch) return bundleMatch[1]!;

  const legacyKey = legacyBundleGroupKey(agr);
  if (legacyKey) {
    const baseId = legacyKey.split("|")[0]!;
    return baseId.slice(4);
  }

  return null;
}

function jointTestingDealKey(agr: ActiveAgreementPayload): string {
  const sessionRef = negotiationSessionRefFromAgreement(agr) ?? agr.id;
  return `${sessionRef}|${agr.signedRound}|${agr.fulfilledAtRound ?? ""}`;
}

function pickPreferredJointTestingDuplicate(
  candidates: ActiveAgreementPayload[],
): ActiveAgreementPayload {
  return [...candidates].sort((a, b) => {
    const score = (agr: ActiveAgreementPayload) => {
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
  agreements: ActiveAgreementPayload[],
): ActiveAgreementPayload[] {
  const passthrough: ActiveAgreementPayload[] = [];
  const jointByDeal = new Map<string, ActiveAgreementPayload>();

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

export function consolidateJointTestingAgreements(
  agreements: ActiveAgreementPayload[],
): ActiveAgreementPayload[] {
  const passthrough: ActiveAgreementPayload[] = [];
  const legacyGroups = new Map<string, ActiveAgreementPayload[]>();

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

  const bundled: ActiveAgreementPayload[] = [];
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

    const candidate: ActiveAgreementPayload = {
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
  agr: ActiveAgreementPayload,
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
): ActiveAgreementPayload[] {
  return consolidateJointTestingAgreements(meta.activeAgreements ?? []).filter(
    (agr) => isJointTestingAgreementPending(agr, currentRound),
  );
}

export function pendingJointTestingBundles(
  meta: MetaStatePayload,
  currentRound = meta.currentRound,
): ActiveAgreementPayload[] {
  return activeJointTestingAgreements(meta, currentRound).sort(
    (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
  );
}

export interface JointTestingPartnerGroup {
  key: string;
  partners: string[];
  agreements: ActiveAgreementPayload[];
}

export function jointTestingPartnerGroupKey(partners: string[]): string {
  return [...partners]
    .map(teamNameKey)
    .filter(Boolean)
    .sort()
    .join("|");
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
    if (trackId) tracks.add(trackId);
  }
  return [...tracks].sort((a, b) => a.localeCompare(b));
}

export function pickJointAgreementForGroupAndTrack(
  group: JointTestingPartnerGroup,
  trackId: string,
): ActiveAgreementPayload | null {
  const matches = group.agreements.filter(
    (agr) => agr.terms.sharedTrackId === trackId,
  );
  if (!matches.length) return null;
  return matches.sort(
    (a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id),
  )[0]!;
}

export function activeJointTestingPartners(meta: MetaStatePayload): string[] {
  const partners = new Set<string>();
  for (const agr of pendingJointTestingBundles(meta)) {
    for (const team of agreementPartnerTeams(agr)) {
      partners.add(team);
    }
  }
  return [...partners].sort((a, b) => a.localeCompare(b));
}

export function jointTestDefaultsForAgreement(
  agreement: ActiveAgreementPayload,
  progress?: MetaStatePayload["privateTestProgress"],
): {
  trackId?: string;
  durationHours?: number;
  plan: JointTestSessionPlan;
} {
  const plan = jointTestSessionPlan(agreement);
  const sessionIndex = nextJointTestSessionIndex(plan, progress) ?? 0;
  return {
    trackId: agreement.terms.sharedTrackId,
    durationHours: plan.sessions[sessionIndex]?.durationHours,
    plan,
  };
}

export function isRaceWeekendInProgress(meta: MetaStatePayload): boolean {
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed) return false;
  if (!weekendScheduleActive(current)) return false;
  return meta.weekendProgress?.round === meta.currentRound;
}

export function privateTestBonusHint(
  meta: MetaStatePayload,
  partnerTeams?: string[],
): string | null {
  let partners = activeJointTestingPartners(meta);
  if (partnerTeams?.length) {
    const keys = new Set(partnerTeams.map(teamNameKey));
    partners = partners.filter((name) => keys.has(teamNameKey(name)));
  }
  if (!partners.length) return null;
  const pct = Math.min(50, partners.length * 25);
  return `Joint testing +${pct}% XP (${partners.join(", ")})`;
}

export function privateTestBlockedReason(meta: MetaStatePayload): string | null {
  if (!meta.setupComplete) return "Complete team setup first";
  if (isSeasonFinished(meta)) {
    return "Season complete — review results and start the next season";
  }
  if (isRaceWeekendInProgress(meta)) {
    return "Finish the race weekend before scheduling a private test";
  }
  if (!meta.fleet?.length) return "Your team needs at least one car";
  return null;
}

export function canStartPrivateTest(meta: MetaStatePayload): boolean {
  return privateTestBlockedReason(meta) === null;
}

export function defaultPrivateTestDurationHours(
  meta: MetaStatePayload,
  agreementId?: string | null,
): number {
  if (!agreementId) return PRIVATE_TEST_DEFAULT_HOURS;
  const agreement = pendingJointTestingBundles(meta).find((agr) => agr.id === agreementId);
  if (!agreement) return PRIVATE_TEST_DEFAULT_HOURS;
  return jointTestDefaultsForAgreement(agreement).durationHours ?? PRIVATE_TEST_DEFAULT_HOURS;
}
