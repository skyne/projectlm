import type { MetaStatePayload, StartPrivateTestPayload } from "./protocol.js";
import {
  agreementPartnerTeams,
  pendingJointTestingPartnerGroups,
  pickJointAgreementForGroupAndTrack,
} from "../../../server/src/game/private_test.js";

export interface BuildPrivateTestOptions {
  joint?: boolean;
  agreementId?: string;
  trackId?: string;
  durationHours?: number;
}

function defaultTrackId(meta: MetaStatePayload): string {
  return (
    meta.calendar?.find((e) => e.round === meta.currentRound)?.trackId ??
    "spa"
  );
}

function buildDriverAssignments(
  meta: MetaStatePayload,
): { driverAssignments: Record<string, string[]> } | { error: string } {
  const fleet = meta.fleet ?? [];
  const roster = meta.driverRoster ?? [];
  const driverAssignments: Record<string, string[]> = {};

  for (const car of fleet) {
    const rosterIds = new Set(
      roster.map((d) => d.id).filter((id): id is string => Boolean(id)),
    );
    const fromCar = (car.assignedDriverIds ?? []).filter((id) =>
      rosterIds.has(id),
    );
    if (fromCar.length) {
      driverAssignments[car.id] = fromCar;
      continue;
    }
    const fallback = roster.find((d) => d.id)?.id;
    if (!fallback) {
      return { error: `No driver assigned to car #${car.carNumber}` };
    }
    driverAssignments[car.id] = [fallback];
  }

  return { driverAssignments };
}

export function buildPrivateTestPayload(
  meta: MetaStatePayload,
  options: BuildPrivateTestOptions = {},
): StartPrivateTestPayload | { error: string } {
  const fleet = meta.fleet ?? [];
  if (!fleet.length) return { error: "No cars in fleet" };

  const drivers = buildDriverAssignments(meta);
  if ("error" in drivers) return drivers;

  const carIds = fleet.map((c) => c.id);
  const trackId = options.trackId ?? defaultTrackId(meta);

  if (options.joint || options.agreementId) {
    const groups = pendingJointTestingPartnerGroups(meta as never);
    if (!groups.length) {
      return { error: "No pending joint-testing agreements" };
    }

    let agreement = null;
    if (options.agreementId) {
      for (const group of groups) {
        agreement =
          group.agreements.find((agr) => agr.id === options.agreementId) ??
          pickJointAgreementForGroupAndTrack(group, trackId);
        if (agreement) break;
      }
    } else {
      const group = groups[0]!;
      agreement = pickJointAgreementForGroupAndTrack(group, trackId) ?? group.agreements[0]!;
    }

    if (!agreement) {
      return { error: "Joint-testing agreement not found for selected track" };
    }

    const resolvedTrack = agreement.terms.sharedTrackId ?? trackId;
    const partners = agreementPartnerTeams(agreement as never);
    return {
      trackId: resolvedTrack,
      carIds,
      driverAssignments: drivers.driverAssignments,
      durationHours: options.durationHours ?? 4,
      jointAgreementId: agreement.id,
      jointPartnerTeams: partners,
    };
  }

  return {
    trackId,
    carIds,
    driverAssignments: drivers.driverAssignments,
    durationHours: options.durationHours ?? 4,
  };
}

