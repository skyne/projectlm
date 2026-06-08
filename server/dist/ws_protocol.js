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
            "join_session",
            "set_time_scale",
            "pause",
            "resume",
            "restart_race",
            "end_session",
            "reload_definitions",
            "submit_command",
            "hire_staff",
            "rd_invest",
            "complete_round",
            "start_round",
            "continue_weekend_session",
            "create_team",
            "save_team_creation_draft",
            "save_car_build",
            "buy_car",
            "set_active_car",
            "set_player_entry",
            "remove_car",
            "save_driver_roster",
            "refresh_driver_market",
            "sign_driver_contract",
            "refresh_staff_market",
            "sign_staff_contract",
            "save_team_colors",
            "sign_sponsor",
            "drop_sponsor",
            "new_game",
            "get_track_preview",
            "set_weekend_tire_compound",
            "save_track_setup",
            "ask_engineer",
            "get_engineer_status",
            "ask_garage_engineer",
            "repair_car_condition",
            "start_next_season",
            "restart_season",
            "finalize_season",
        ];
        if (!allowed.includes(msg.type))
            return null;
        return msg;
    }
    catch {
        return null;
    }
}
