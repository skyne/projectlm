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
        if (msg.type !== "set_time_scale" &&
            msg.type !== "pause" &&
            msg.type !== "resume" &&
            msg.type !== "restart_race" &&
            msg.type !== "reload_definitions") {
            return null;
        }
        return msg;
    }
    catch {
        return null;
    }
}
