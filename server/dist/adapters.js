"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEvent = normalizeEvent;
exports.normalizeTrackGeometry = normalizeTrackGeometry;
const EVENT_TYPE_MAP = {
    sector_cross: "SectorCross",
    lap_complete: "LapComplete",
    pit_enter: "PitEnter",
    pit_exit: "PitExit",
    retirement: "Retirement",
    race_complete: "RaceComplete",
    overtake: "Overtake",
    collision: "Collision",
    blocked: "Blocked",
    command_ack: "CommandAck",
    stranded: "Stranded",
    recovery_dispatched: "RecoveryDispatched",
    track_clear: "TrackClear",
    surface_hazard: "SurfaceHazard",
    surface_cleared: "SurfaceCleared",
    blue_flag: "BlueFlag",
    penalty_issued: "PenaltyIssued",
    penalty_warning: "PenaltyWarning",
    racing_incident: "RacingIncident",
    drive_through_served: "DriveThroughServed",
    stop_go_served: "StopGoServed",
    meatball_flag: "MeatballFlag",
    black_flag: "BlackFlag",
    disqualified: "Disqualified",
    slow_zone: "SlowZone",
    fcy_deploy: "FcyDeploy",
    fcy_end: "FcyEnd",
    safety_car_deploy: "SafetyCarDeploy",
    safety_car_in_this_lap: "SafetyCarInThisLap",
    green_flag: "GreenFlag",
    white_flag: "WhiteFlag",
};
function normalizeEvent(event) {
    return {
        type: EVENT_TYPE_MAP[event.type] ?? "SectorCross",
        entryId: event.entryId,
        lap: event.lap,
        sectorIndex: event.sectorIndex,
        timestamp: event.timestamp,
        message: event.message,
    };
}
function normalizeTrackGeometry(geometry) {
    const polyline = geometry.points;
    const sectors = geometry.sectors.map((sector) => {
        const midT = (sector.startT + sector.endT) * 0.5;
        const idx = Math.min(polyline.length - 1, Math.max(0, Math.round(midT * (polyline.length - 1))));
        const label = polyline[idx] ?? { x: 0, z: 0 };
        return {
            name: sector.name,
            startT: sector.startT,
            endT: sector.endT,
            labelX: label.x,
            labelZ: label.z,
        };
    });
    return {
        name: geometry.name,
        lapLength: geometry.lapLength,
        closed: true,
        polyline,
        sectors,
    };
}
