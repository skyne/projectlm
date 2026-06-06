"use strict";
/** WebSocket protocol v1 — see docs/WS_PROTOCOL.md */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL_VERSION = void 0;
exports.serverMessage = serverMessage;
exports.parseClientMessage = parseClientMessage;
exports.PROTOCOL_VERSION = 1;
function serverMessage(type, payload) {
    return { protocol: exports.PROTOCOL_VERSION, type, payload };
}
function parseClientMessage(raw) {
    try {
        const msg = JSON.parse(raw);
        if (msg.protocol !== exports.PROTOCOL_VERSION)
            return null;
        const allowed = [
            "set_time_scale",
            "pause",
            "resume",
            "restart_race",
            "reload_definitions",
            "get_meta",
            "start_session",
            "save_car_setup",
            "set_active_car",
            "advance_weekend",
            "complete_round",
        ];
        if (!allowed.includes(msg.type))
            return null;
        return msg;
    }
    catch {
        return null;
    }
}
