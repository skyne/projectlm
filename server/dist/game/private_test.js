"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOINT_TEST_HOURS_PER_DAY = exports.MAX_JOINT_TEST_HOURS_PER_DAY = exports.MIN_JOINT_TEST_HOURS_PER_DAY = exports.DEFAULT_JOINT_TEST_HOURS_PER_DAY = exports.PRIVATE_TEST_DEFAULT_HOURS = exports.PRIVATE_TEST_MAX_HOURS = exports.PRIVATE_TEST_MIN_HOURS = void 0;
exports.resolveTestHoursPerDay = resolveTestHoursPerDay;
exports.jointTestSessionPlan = jointTestSessionPlan;
exports.formatJointTestPlanSummary = formatJointTestPlanSummary;
exports.jointTestCampaignComplete = jointTestCampaignComplete;
exports.nextJointTestSessionIndex = nextJointTestSessionIndex;
exports.buildPrivateTestProgress = buildPrivateTestProgress;
exports.privateTestPayloadFromProgress = privateTestPayloadFromProgress;
exports.agreementPartnerTeams = agreementPartnerTeams;
exports.jointTestingPartnerGroupKey = jointTestingPartnerGroupKey;
exports.pendingJointTestingPartnerGroups = pendingJointTestingPartnerGroups;
exports.allowedJointTestTrackIdsForGroup = allowedJointTestTrackIdsForGroup;
exports.pickJointAgreementForGroupAndTrack = pickJointAgreementForGroupAndTrack;
exports.consolidateJointTestingAgreements = consolidateJointTestingAgreements;
exports.isJointTestingAgreementPending = isJointTestingAgreementPending;
exports.activeJointTestingAgreements = activeJointTestingAgreements;
exports.pendingJointTestingBundles = pendingJointTestingBundles;
exports.activeJointTestingPartners = activeJointTestingPartners;
exports.jointTestDefaultsForAgreement = jointTestDefaultsForAgreement;
exports.fulfillJointTestingAgreement = fulfillJointTestingAgreement;
exports.resolveJointTestSelection = resolveJointTestSelection;
exports.validateJointTestingSelection = validateJointTestingSelection;
exports.clampPrivateTestDurationHours = clampPrivateTestDurationHours;
exports.isRaceWeekendInProgress = isRaceWeekendInProgress;
exports.canStartPrivateTest = canStartPrivateTest;
exports.privateTestBlockedReason = privateTestBlockedReason;
exports.validatePrivateTestPayload = validatePrivateTestPayload;
exports.trackMonthForPrivateTest = trackMonthForPrivateTest;
exports.privateTestWeatherSeed = privateTestWeatherSeed;
exports.collectPrivateTestParticipants = collectPrivateTestParticipants;
const fleet_1 = require("./fleet");
const driver_catalog_1 = require("./driver_catalog");
const season_end_1 = require("./season_end");
const weekend_sessions_1 = require("./weekend_sessions");
const track_catalog_1 = require("./track_catalog");
exports.PRIVATE_TEST_MIN_HOURS = 1;
exports.PRIVATE_TEST_MAX_HOURS = 72;
exports.PRIVATE_TEST_DEFAULT_HOURS = 4;
exports.DEFAULT_JOINT_TEST_HOURS_PER_DAY = 24;
exports.MIN_JOINT_TEST_HOURS_PER_DAY = 1;
exports.MAX_JOINT_TEST_HOURS_PER_DAY = 24;
/** @deprecated Use resolveTestHoursPerDay — legacy saves assumed 8 h/day. */
exports.JOINT_TEST_HOURS_PER_DAY = 8;
function resolveTestHoursPerDay(terms) {
    const raw = terms.testHoursPerDay;
    if (raw == null || !Number.isFinite(raw)) {
        return exports.DEFAULT_JOINT_TEST_HOURS_PER_DAY;
    }
    return Math.min(exports.MAX_JOINT_TEST_HOURS_PER_DAY, Math.max(exports.MIN_JOINT_TEST_HOURS_PER_DAY, Math.round(raw)));
}
function jointTestSessionPlan(agr) {
    const testDays = Math.max(1, agr.terms.testDays ?? 1);
    const testHoursPerDay = resolveTestHoursPerDay(agr.terms);
    if (testHoursPerDay >= exports.MAX_JOINT_TEST_HOURS_PER_DAY) {
        const durationHours = clampPrivateTestDurationHours(testDays * exports.MAX_JOINT_TEST_HOURS_PER_DAY);
        return {
            mode: "continuous",
            testDays,
            testHoursPerDay,
            totalHours: durationHours,
            sessions: [
                {
                    sessionIndex: 0,
                    durationHours,
                    label: testDays === 1
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
function formatJointTestPlanSummary(plan) {
    if (plan.mode === "continuous") {
        return `${plan.testDays} day${plan.testDays === 1 ? "" : "s"} · ${plan.sessions[0].durationHours} h continuous`;
    }
    return `${plan.testDays} days × ${plan.testHoursPerDay} h/day`;
}
function jointTestCampaignComplete(plan, progress) {
    return progress.completedSessionIndices.length >= plan.sessions.length;
}
function nextJointTestSessionIndex(plan, progress) {
    const completed = progress?.completedSessionIndices.length ?? 0;
    if (completed >= plan.sessions.length)
        return null;
    return completed;
}
function buildPrivateTestProgress(payload, plan) {
    return {
        trackId: payload.trackId,
        carIds: [...payload.carIds],
        driverAssignments: structuredClone(payload.driverAssignments),
        jointAgreementId: payload.jointAgreementId,
        jointPartnerTeams: [...(payload.jointPartnerTeams ?? [])],
        testDays: plan.testDays,
        testHoursPerDay: plan.testHoursPerDay,
        sessionMode: plan.mode === "continuous" ? "continuous" : "per_day",
        completedSessionIndices: [],
        carSetups: payload.carSetups ? structuredClone(payload.carSetups) : undefined,
    };
}
function privateTestPayloadFromProgress(progress, plan) {
    const sessionIndex = nextJointTestSessionIndex(plan, progress);
    if (sessionIndex == null)
        return null;
    const slot = plan.sessions[sessionIndex];
    if (!slot)
        return null;
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
function teamNameKey(name) {
    return name.trim().toLowerCase();
}
function agreementPartnerTeams(agr) {
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
function partnerTeamSetKey(teams) {
    return [...teams]
        .map(teamNameKey)
        .filter(Boolean)
        .sort()
        .join("|");
}
function jointTestingPartnerGroupKey(partners) {
    return partnerTeamSetKey(partners);
}
function pendingJointTestingPartnerGroups(meta, currentRound = meta.currentRound) {
    const groups = new Map();
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
        agreements: group.agreements.sort((a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id)),
    }))
        .sort((a, b) => a.partners.join(" + ").localeCompare(b.partners.join(" + ")));
}
function allowedJointTestTrackIdsForGroup(group) {
    const tracks = new Set();
    for (const agr of group.agreements) {
        const trackId = agr.terms.sharedTrackId?.trim();
        if (trackId && track_catalog_1.TRACK_CATALOG[trackId])
            tracks.add(trackId);
    }
    return [...tracks].sort((a, b) => a.localeCompare(b));
}
function pickJointAgreementForGroupAndTrack(group, trackId) {
    const matches = group.agreements.filter((agr) => agr.terms.sharedTrackId === trackId);
    if (!matches.length)
        return null;
    return matches.sort((a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id))[0];
}
function slugifyTeamName(name) {
    return name.replace(/\s+/g, "-").toLowerCase();
}
function legacyBundleGroupKey(agr) {
    if (agr.kind !== "joint_testing" || agr.id.includes("-bundle-"))
        return null;
    if (agreementPartnerTeams(agr).length > 1)
        return null;
    if (!agr.partnerTeam)
        return null;
    const partnerSlug = slugifyTeamName(agr.partnerTeam);
    const suffix = `-${partnerSlug}`;
    if (!agr.id.endsWith(suffix))
        return null;
    const base = agr.id.slice(0, -suffix.length);
    if (!base.startsWith("agr-neg-inter-joint_testing-"))
        return null;
    return `${base}|${agr.signedRound}|${agr.fulfilledAtRound ?? ""}`;
}
function negotiationSessionRefFromAgreement(agr) {
    const bundleMatch = agr.id.match(/^agr-(neg-inter-joint_testing-.+)-bundle-\d+$/);
    if (bundleMatch)
        return bundleMatch[1];
    const legacyKey = legacyBundleGroupKey(agr);
    if (legacyKey) {
        const baseId = legacyKey.split("|")[0];
        return baseId.slice(4);
    }
    return null;
}
function jointTestingDealKey(agr) {
    const sessionRef = negotiationSessionRefFromAgreement(agr) ?? agr.id;
    return `${sessionRef}|${agr.signedRound}|${agr.fulfilledAtRound ?? ""}`;
}
function pickPreferredJointTestingDuplicate(candidates) {
    return [...candidates].sort((a, b) => {
        const score = (agr) => {
            let value = 0;
            if (agr.id.includes("-bundle-"))
                value += 4;
            if ((agr.partnerTeams?.length ?? 0) > 1)
                value += 2;
            if ((agr.terms.partnerTeams?.length ?? 0) > 1)
                value += 1;
            return value;
        };
        const diff = score(b) - score(a);
        if (diff !== 0)
            return diff;
        return a.id.localeCompare(b.id);
    })[0];
}
function dedupeJointTestingByDealKey(agreements) {
    const passthrough = [];
    const jointByDeal = new Map();
    for (const agr of agreements) {
        if (agr.kind !== "joint_testing") {
            passthrough.push(agr);
            continue;
        }
        const key = jointTestingDealKey(agr);
        const existing = jointByDeal.get(key);
        jointByDeal.set(key, existing ? pickPreferredJointTestingDuplicate([existing, agr]) : agr);
    }
    return [...passthrough, ...jointByDeal.values()];
}
/** Merge legacy per-team rows from one multi-party deal into bundled agreements. */
function consolidateJointTestingAgreements(agreements) {
    const passthrough = [];
    const legacyGroups = new Map();
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
    const bundled = [];
    const passthroughDealKeys = new Set(passthrough.map((agr) => jointTestingDealKey(agr)));
    for (const [groupKey, group] of legacyGroups) {
        if (group.length === 1) {
            passthrough.push(group[0]);
            continue;
        }
        const partners = [
            ...new Set(group.map((agr) => agr.partnerTeam).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b));
        const template = group.sort((a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id))[0];
        const baseId = groupKey.split("|")[0];
        const fulfilledAtRound = group.every((agr) => agr.fulfilledAtRound)
            ? group.find((agr) => agr.fulfilledAtRound)?.fulfilledAtRound
            : undefined;
        const candidate = {
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
            stubNote: partners.length > 1
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
function isJointTestingAgreementPending(agr, currentRound = 0) {
    return (agr.kind === "joint_testing" &&
        agreementPartnerTeams(agr).length > 0 &&
        !agr.fulfilledAtRound &&
        currentRound <= agr.expiresAtRound);
}
function activeJointTestingAgreements(meta, currentRound = meta.currentRound) {
    return consolidateJointTestingAgreements(meta.activeAgreements ?? []).filter((agr) => isJointTestingAgreementPending(agr, currentRound));
}
function pendingJointTestingBundles(meta, currentRound = meta.currentRound) {
    return activeJointTestingAgreements(meta, currentRound).sort((a, b) => a.signedRound - b.signedRound || a.id.localeCompare(b.id));
}
function activeJointTestingPartners(meta, currentRound = meta.currentRound) {
    const partners = new Set();
    for (const agr of pendingJointTestingBundles(meta, currentRound)) {
        for (const team of agreementPartnerTeams(agr)) {
            partners.add(team);
        }
    }
    return [...partners].sort((a, b) => a.localeCompare(b));
}
function jointTestDefaultsForAgreement(agreement) {
    const plan = jointTestSessionPlan(agreement);
    const sessionIndex = 0;
    return {
        trackId: agreement.terms.sharedTrackId,
        durationHours: plan.sessions[sessionIndex]?.durationHours,
        plan,
    };
}
function fulfillJointTestingAgreement(agreements, agreementId, fulfillingRound) {
    const consolidated = consolidateJointTestingAgreements(agreements);
    return consolidated.map((agr) => agr.id === agreementId && !agr.fulfilledAtRound
        ? { ...agr, fulfilledAtRound: fulfillingRound }
        : agr);
}
function resolveJointTestSelection(meta, agreementId) {
    if (!agreementId) {
        return { partnerTeams: [] };
    }
    const agreement = pendingJointTestingBundles(meta).find((agr) => agr.id === agreementId);
    if (!agreement) {
        return { partnerTeams: [], error: "Joint-testing agreement is no longer pending" };
    }
    return { agreement, partnerTeams: agreementPartnerTeams(agreement) };
}
function validateJointTestingSelection(meta, agreementId, partnerTeams = []) {
    if (!agreementId) {
        if (partnerTeams.length) {
            return "Select a joint-testing agreement — partial partner sessions are not valid";
        }
        return null;
    }
    const resolved = resolveJointTestSelection(meta, agreementId);
    if (resolved.error)
        return resolved.error;
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
function clampPrivateTestDurationHours(hours) {
    if (!Number.isFinite(hours))
        return exports.PRIVATE_TEST_DEFAULT_HOURS;
    return Math.min(exports.PRIVATE_TEST_MAX_HOURS, Math.max(exports.PRIVATE_TEST_MIN_HOURS, Math.round(hours)));
}
function isRaceWeekendInProgress(meta) {
    const current = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!current || current.completed)
        return false;
    if (!(0, weekend_sessions_1.appliesWeekendSchedule)(current.eventType, current.format))
        return false;
    return meta.weekendProgress?.round === meta.currentRound;
}
function canStartPrivateTest(meta) {
    return privateTestBlockedReason(meta) === null;
}
function privateTestBlockedReason(meta) {
    if (!meta.setupComplete)
        return "Complete team setup first";
    if (meta.seasonComplete || (0, season_end_1.isSeasonCalendarComplete)(meta.calendar)) {
        return "Season complete — review results and start the next season";
    }
    if (isRaceWeekendInProgress(meta)) {
        return "Finish the race weekend before scheduling a private test";
    }
    if (!meta.fleet?.length)
        return "Your team needs at least one car";
    return null;
}
function validateDriverAssignments(meta, carIds, driverAssignments) {
    const roster = meta.driverRoster ?? [];
    const fleetSubset = carIds.map((id) => {
        const car = meta.fleet?.find((c) => c.id === id);
        if (!car)
            return null;
        const assigned = driverAssignments[id];
        if (!assigned?.length) {
            return { ...car, assignedDriverIds: [] };
        }
        return { ...car, assignedDriverIds: (0, driver_catalog_1.sanitizeAssignedDriverIds)(assigned, roster) };
    });
    if (fleetSubset.some((c) => c === null)) {
        return "One or more selected cars were not found in your fleet";
    }
    return (0, driver_catalog_1.validateExclusiveDriverAssignments)(fleetSubset.filter((c) => c !== null), roster);
}
function validatePrivateTestPayload(meta, raw) {
    const blocked = privateTestBlockedReason(meta);
    if (blocked)
        return { error: blocked };
    const trackId = String(raw.trackId ?? "").trim();
    if (!trackId || !track_catalog_1.TRACK_CATALOG[trackId]) {
        return { error: "Select a valid track" };
    }
    const carIds = [...new Set((raw.carIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (!carIds.length)
        return { error: "Select at least one car" };
    const fleetIds = new Set((meta.fleet ?? []).map((c) => c.id));
    for (const carId of carIds) {
        if (!fleetIds.has(carId))
            return { error: `Unknown car: ${carId}` };
    }
    const fleetSubset = (meta.fleet ?? []).filter((c) => carIds.includes(c.id));
    const fleetErr = (0, fleet_1.validateFleetRegulations)(fleetSubset);
    if (fleetErr)
        return { error: fleetErr };
    const driverAssignments = raw.driverAssignments ?? {};
    for (const carId of carIds) {
        if (!driverAssignments[carId]?.length) {
            const car = meta.fleet?.find((c) => c.id === carId);
            return { error: `Assign at least one driver to car #${car?.carNumber ?? carId}` };
        }
    }
    const assignmentKeys = Object.keys(driverAssignments).filter((k) => driverAssignments[k]?.length);
    for (const key of assignmentKeys) {
        if (!carIds.includes(key)) {
            return { error: "Driver assignments must match selected cars only" };
        }
    }
    const assignErr = validateDriverAssignments(meta, carIds, driverAssignments);
    if (assignErr)
        return { error: assignErr };
    const jointAgreementId = String(raw.jointAgreementId ?? "").trim() || undefined;
    const resolved = resolveJointTestSelection(meta, jointAgreementId);
    if (resolved.error)
        return { error: resolved.error };
    const jointPartnerTeams = resolved.partnerTeams;
    const selectionErr = validateJointTestingSelection(meta, jointAgreementId, jointPartnerTeams);
    if (selectionErr)
        return { error: selectionErr };
    let durationHours = clampPrivateTestDurationHours(raw.durationHours);
    if (resolved.agreement) {
        const plan = jointTestSessionPlan(resolved.agreement);
        const progress = meta.privateTestProgress;
        const requiredTrack = resolved.agreement.terms.sharedTrackId?.trim();
        if (requiredTrack && trackId !== requiredTrack) {
            return {
                error: `This joint-testing contract is for ${(0, track_catalog_1.trackDisplayName)(requiredTrack)} only`,
            };
        }
        if (progress && progress.jointAgreementId !== jointAgreementId) {
            return { error: "Finish the in-progress joint test campaign first" };
        }
        if (progress &&
            progress.jointAgreementId === jointAgreementId &&
            (progress.trackId !== trackId ||
                progress.jointPartnerTeams.join("|") !== jointPartnerTeams.join("|"))) {
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
    }
    else if (meta.privateTestProgress) {
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
function trackMonthForPrivateTest(trackId) {
    const event = track_catalog_1.WEC_2026_CALENDAR.find((e) => e.trackId === trackId);
    return event?.month ?? 6;
}
function privateTestWeatherSeed(seasonYear, trackId) {
    let hash = 0;
    for (let i = 0; i < trackId.length; i++) {
        hash = (hash * 31 + trackId.charCodeAt(i)) | 0;
    }
    return seasonYear * 1000 + Math.abs(hash % 1000);
}
function collectPrivateTestParticipants(meta, carIds, driverAssignments) {
    const driverIds = new Set();
    for (const carId of carIds) {
        for (const id of (0, driver_catalog_1.sanitizeAssignedDriverIds)(driverAssignments[carId] ?? [], meta.driverRoster ?? [])) {
            driverIds.add(id);
        }
    }
    const carIdSet = new Set(carIds);
    const staffIds = (meta.staff ?? [])
        .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
        .map((s) => s.id)
        .filter((id) => Boolean(id));
    return { driverIds: [...driverIds], staffIds };
}
