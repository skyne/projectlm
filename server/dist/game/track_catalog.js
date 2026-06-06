"use strict";
/** WEC track registry and 2026 season calendar (single source of truth). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEC_2026_CALENDAR = exports.TRACK_CATALOG = void 0;
exports.trackJsonPath = trackJsonPath;
exports.trackDisplayName = trackDisplayName;
exports.formatToDurationSeconds = formatToDurationSeconds;
exports.formatDisplayLabel = formatDisplayLabel;
exports.calendarRoundLabel = calendarRoundLabel;
exports.defaultWecCalendarPayload = defaultWecCalendarPayload;
exports.nextCalendarRound = nextCalendarRound;
exports.migrateWecCalendar = migrateWecCalendar;
exports.TRACK_CATALOG = {
    paul_ricard: {
        id: "paul_ricard",
        displayName: "Circuit Paul Ricard",
        country: "France",
        jsonPath: "tracks/paul_ricard.json",
        lapLengthM: 5842,
    },
    imola: {
        id: "imola",
        displayName: "Autodromo Enzo e Dino Ferrari",
        country: "Italy",
        jsonPath: "tracks/imola.json",
        lapLengthM: 4909,
    },
    spa: {
        id: "spa",
        displayName: "Circuit de Spa-Francorchamps",
        country: "Belgium",
        jsonPath: "tracks/spa.json",
        lapLengthM: 7004,
    },
    lemans_la_sarthe: {
        id: "lemans_la_sarthe",
        displayName: "Circuit de la Sarthe",
        country: "France",
        jsonPath: "tracks/lemans_la_sarthe.json",
        lapLengthM: 13626,
    },
    sao_paulo: {
        id: "sao_paulo",
        displayName: "Autódromo José Carlos Pace",
        country: "Brazil",
        jsonPath: "tracks/sao_paulo.json",
        lapLengthM: 4309,
    },
    cota: {
        id: "cota",
        displayName: "Circuit of the Americas",
        country: "USA",
        jsonPath: "tracks/cota.json",
        lapLengthM: 5513,
    },
    fuji: {
        id: "fuji",
        displayName: "Fuji Speedway",
        country: "Japan",
        jsonPath: "tracks/fuji.json",
        lapLengthM: 4563,
    },
    losail: {
        id: "losail",
        displayName: "Lusail International Circuit",
        country: "Qatar",
        jsonPath: "tracks/losail.json",
        lapLengthM: 5380,
    },
    bahrain: {
        id: "bahrain",
        displayName: "Bahrain International Circuit",
        country: "Bahrain",
        jsonPath: "tracks/bahrain.json",
        lapLengthM: 5412,
    },
};
/** 2026 FIA WEC calendar — Qatar rescheduled to October; Paul Ricard pre-season test. */
exports.WEC_2026_CALENDAR = [
    {
        round: 0,
        trackId: "paul_ricard",
        format: "test",
        eventType: "test",
        eventName: "Official Test — Paul Ricard",
        month: 3,
    },
    {
        round: 1,
        trackId: "imola",
        format: "6h",
        eventType: "race",
        eventName: "6 Hours of Imola",
        month: 4,
    },
    {
        round: 2,
        trackId: "spa",
        format: "6h",
        eventType: "race",
        eventName: "6 Hours of Spa-Francorchamps",
        month: 5,
    },
    {
        round: 3,
        trackId: "lemans_la_sarthe",
        format: "24h",
        eventType: "race",
        eventName: "24 Hours of Le Mans",
        month: 6,
    },
    {
        round: 4,
        trackId: "sao_paulo",
        format: "6h",
        eventType: "race",
        eventName: "6 Hours of São Paulo",
        month: 7,
    },
    {
        round: 5,
        trackId: "cota",
        format: "6h",
        eventType: "race",
        eventName: "Lone Star Le Mans",
        month: 9,
    },
    {
        round: 6,
        trackId: "fuji",
        format: "6h",
        eventType: "race",
        eventName: "6 Hours of Fuji",
        month: 9,
    },
    {
        round: 7,
        trackId: "losail",
        format: "1812km",
        eventType: "race",
        eventName: "Qatar 1812 km",
        month: 10,
    },
    {
        round: 8,
        trackId: "bahrain",
        format: "8h",
        eventType: "race",
        eventName: "8 Hours of Bahrain",
        month: 11,
    },
];
function trackJsonPath(trackId) {
    return exports.TRACK_CATALOG[trackId]?.jsonPath ?? exports.TRACK_CATALOG.lemans_la_sarthe.jsonPath;
}
function trackDisplayName(trackId) {
    return exports.TRACK_CATALOG[trackId]?.displayName ?? trackId.replace(/_/g, " ");
}
function formatToDurationSeconds(format) {
    const lower = format.trim().toLowerCase();
    const hourMatch = /^(\d+(?:\.\d+)?)h$/.exec(lower);
    if (hourMatch)
        return parseFloat(hourMatch[1]) * 3600;
    if (lower === "test")
        return 3 * 3600;
    if (lower === "1812km")
        return 10 * 3600;
    return 0;
}
function formatDisplayLabel(format, eventType) {
    const lower = format.toLowerCase();
    if (eventType === "test" || lower === "test")
        return "Official Test";
    if (lower === "1812km")
        return "1812 km";
    if (lower.endsWith("h"))
        return `${lower.replace("h", "")} Hour`;
    return format;
}
function calendarRoundLabel(round, eventType) {
    if (eventType === "test" || round === 0)
        return "Test";
    return `R${round}`;
}
function defaultWecCalendarPayload() {
    return exports.WEC_2026_CALENDAR.map((e) => ({
        round: e.round,
        trackId: e.trackId,
        format: e.format,
        eventType: e.eventType,
        eventName: e.eventName,
        month: e.month,
        completed: false,
        championshipPoints: 0,
    }));
}
function nextCalendarRound(calendar, currentRound) {
    const sorted = [...calendar].sort((a, b) => a.round - b.round);
    const idx = sorted.findIndex((e) => e.round === currentRound);
    if (idx < 0)
        return null;
    for (let i = idx + 1; i < sorted.length; i++) {
        if (!sorted[i].completed)
            return sorted[i].round;
    }
    return null;
}
const LEGACY_TRACK_IDS = new Set(["monza"]);
/** Upgrade saves that still use the old 3-round placeholder calendar. */
function migrateWecCalendar(calendar) {
    const needsUpgrade = calendar.length < exports.WEC_2026_CALENDAR.length ||
        calendar.some((e) => LEGACY_TRACK_IDS.has(e.trackId));
    if (!needsUpgrade)
        return null;
    const completionByRound = new Map(calendar.map((e) => [e.round, e.completed]));
    const pointsByRound = new Map(calendar.map((e) => [e.round, e.championshipPoints]));
    const prizeByRound = new Map(calendar.map((e) => [e.round, e.prizeMoney]));
    const upgraded = defaultWecCalendarPayload().map((e) => ({
        ...e,
        completed: completionByRound.get(e.round) ?? false,
        championshipPoints: pointsByRound.get(e.round) ?? 0,
        prizeMoney: prizeByRound.get(e.round),
    }));
    const currentRound = upgraded.find((e) => !e.completed)?.round ??
        upgraded[upgraded.length - 1]?.round ??
        0;
    return { calendar: upgraded, currentRound };
}
