import assert from "node:assert/strict";
import test from "node:test";
import { tyreGripScale } from "./tyre_grip";

test("intermediate peaks in damp conditions", () => {
  const inter = tyreGripScale("intermediate", 0.3, 20);
  const slick = tyreGripScale("slick", 0.3, 20);
  const wet = tyreGripScale("wet", 0.3, 20);
  assert.ok(inter > slick);
  assert.ok(inter > wet);
});

test("wet tyres beat slicks on a soaked track", () => {
  assert.ok(tyreGripScale("wet", 0.7, 18) > tyreGripScale("slick", 0.7, 18));
});
