"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGO_DATA_URL_MAX_CHARS = exports.DEFAULT_LIVERY_PATTERN = exports.LIVERY_PATTERN_IDS = void 0;
exports.isValidHexColor = isValidHexColor;
exports.isValidLiveryPattern = isValidLiveryPattern;
exports.isValidLogoDataUrl = isValidLogoDataUrl;
exports.normalizeTeamLivery = normalizeTeamLivery;
exports.LIVERY_PATTERN_IDS = [
    "solid",
    "dual_stripe",
    "center_stripe",
    "side_bands",
    "chevron",
    "gradient_bow",
    "hood_accent",
    "split_diagonal",
];
exports.DEFAULT_LIVERY_PATTERN = "dual_stripe";
/** Max stored logo data URL length in meta JSON. */
exports.LOGO_DATA_URL_MAX_CHARS = 96000;
function isValidHexColor(color) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}
function isValidLiveryPattern(pattern) {
    return exports.LIVERY_PATTERN_IDS.includes(pattern);
}
function isValidLogoDataUrl(value) {
    if (typeof value !== "string" || value.length === 0)
        return false;
    if (value.length > exports.LOGO_DATA_URL_MAX_CHARS)
        return false;
    return /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(value);
}
function normalizeTeamLivery(input, fallback) {
    const primary = input?.primary ?? fallback?.primary;
    const secondary = input?.secondary ?? fallback?.secondary;
    if (!primary || !secondary)
        return null;
    if (!isValidHexColor(primary) || !isValidHexColor(secondary))
        return null;
    const patternRaw = input?.pattern ?? fallback?.pattern ?? exports.DEFAULT_LIVERY_PATTERN;
    const pattern = isValidLiveryPattern(patternRaw)
        ? patternRaw
        : exports.DEFAULT_LIVERY_PATTERN;
    let logoDataUrl = null;
    if (input?.logoDataUrl) {
        if (!isValidLogoDataUrl(input.logoDataUrl))
            return null;
        logoDataUrl = input.logoDataUrl;
    }
    else if (input && "logoDataUrl" in input && input.logoDataUrl === null) {
        logoDataUrl = null;
    }
    else if (fallback?.logoDataUrl && isValidLogoDataUrl(fallback.logoDataUrl)) {
        logoDataUrl = fallback.logoDataUrl;
    }
    return { primary, secondary, pattern, logoDataUrl };
}
