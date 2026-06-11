"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_SPONSOR_APPEAL_MULTIPLIER = exports.ALL_FEMALE_STAFF_BONUS = exports.ALL_FEMALE_LINEUP_BONUS = exports.FEMALE_DRIVER_INDIVIDUAL_BONUS = void 0;
exports.driverGender = driverGender;
exports.staffGender = staffGender;
exports.computeCarSponsorAppeal = computeCarSponsorAppeal;
exports.applySponsorAppeal = applySponsorAppeal;
/** Per assigned female driver on a car — fan / lifestyle sponsors respond individually. */
exports.FEMALE_DRIVER_INDIVIDUAL_BONUS = 0.03;
/** All assigned drivers on the car are female (min 2) — programme-wide appeal spike. */
exports.ALL_FEMALE_LINEUP_BONUS = 0.08;
/** Engineer + strategist + mechanic on the car are all female — authentic programme story. */
exports.ALL_FEMALE_STAFF_BONUS = 0.05;
exports.MAX_SPONSOR_APPEAL_MULTIPLIER = 1.2;
function driverGender(d) {
    if (d.gender === "female" || d.gender === "male")
        return d.gender;
    return null;
}
function staffGender(m) {
    if (m.gender === "female" || m.gender === "male")
        return m.gender;
    return null;
}
/**
 * Sponsor enthusiasm multiplier for a single car entry.
 * See docs/DRIVER_GENDER_SPONSOR_MECHANICS.md for design intent.
 */
function computeCarSponsorAppeal(assignedDriverIds, roster, staffOnCar) {
    const lines = [];
    let bonusSum = 0;
    const drivers = assignedDriverIds
        .map((id) => roster.find((d) => d.id === id))
        .filter((d) => Boolean(d));
    const femaleDrivers = drivers.filter((d) => driverGender(d) === "female");
    if (femaleDrivers.length > 0) {
        const b = femaleDrivers.length * exports.FEMALE_DRIVER_INDIVIDUAL_BONUS;
        bonusSum += b;
        lines.push({
            label: `${femaleDrivers.length} female driver${femaleDrivers.length === 1 ? "" : "s"} on entry`,
            bonus: b,
        });
    }
    const allDriversFemale = drivers.length >= 2 && drivers.every((d) => driverGender(d) === "female");
    if (allDriversFemale) {
        bonusSum += exports.ALL_FEMALE_LINEUP_BONUS;
        lines.push({
            label: "All-female driver lineup",
            bonus: exports.ALL_FEMALE_LINEUP_BONUS,
        });
    }
    const keyStaff = staffOnCar.filter((s) => ["engineer", "strategist", "mechanic"].includes(s.role));
    const allKeyStaffFemale = keyStaff.length >= 2 &&
        keyStaff.every((s) => staffGender(s) === "female");
    if (allKeyStaffFemale) {
        bonusSum += exports.ALL_FEMALE_STAFF_BONUS;
        lines.push({
            label: "All-female car crew (eng / strategy / mechanics)",
            bonus: exports.ALL_FEMALE_STAFF_BONUS,
        });
    }
    const multiplier = Math.min(exports.MAX_SPONSOR_APPEAL_MULTIPLIER, 1 + bonusSum);
    return { multiplier, lines };
}
function applySponsorAppeal(amount, multiplier) {
    if (amount <= 0 || multiplier <= 1)
        return amount;
    return Math.round(amount * multiplier);
}
