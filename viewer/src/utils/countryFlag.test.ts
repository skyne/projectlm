import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countryFlagEmoji, formatNationality } from "./countryFlag";

describe("countryFlag", () => {
  it("maps ISO alpha-2 codes to flag emoji", () => {
    assert.equal(countryFlagEmoji("GB").length > 0, true);
    assert.equal(countryFlagEmoji("FR").length > 0, true);
    assert.equal(countryFlagEmoji("us").length > 0, true);
  });

  it("returns empty for invalid codes", () => {
    assert.equal(countryFlagEmoji(""), "");
    assert.equal(countryFlagEmoji("GBR"), "");
  });

  it("formats nationality with flag and code", () => {
    const s = formatNationality("JP");
    assert.match(s, /JP$/);
  });
});
