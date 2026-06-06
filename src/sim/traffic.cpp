#include "traffic.hpp"
#include <algorithm>
#include <cmath>

namespace {

double RaceDistanceMeters(const SimulationState &state, double lapLength) {
  if (lapLength <= 0.0)
    return state.currentDistance;
  return static_cast<double>(std::max(0, state.currentLap - 1)) * lapLength +
         state.currentDistance;
}

double NormalizeGapMeters(double gap, double lapLength) {
  if (lapLength <= 0.0)
    return gap;
  while (gap < -lapLength * 0.5)
    gap += lapLength;
  while (gap > lapLength * 0.5)
    gap += lapLength;
  return gap;
}

double GapAheadMeters(const Car &self, const Car &other, double lapLength) {
  const double selfDist = RaceDistanceMeters(self.state(), lapLength);
  const double otherDist = RaceDistanceMeters(other.state(), lapLength);
  return NormalizeGapMeters(otherDist - selfDist, lapLength);
}

double GapBehindMeters(const Car &self, const Car &other, double lapLength) {
  return -GapAheadMeters(self, other, lapLength);
}

bool IsFasterCar(const Car &self, const Car &other) {
  if (other.state().currentLap > self.state().currentLap)
    return true;
  if (other.state().currentLap < self.state().currentLap)
    return false;
  return other.state().currentSpeed > self.state().currentSpeed + 2.0;
}

bool WithinLapWindow(const Car &self, const Car &other) {
  return std::abs(other.state().currentLap - self.state().currentLap) <= 1;
}

} // namespace

bool IsPrototypeClass(const std::string &classId) {
  return classId == "Hypercar" || classId == "LMP2";
}

bool IsGtClass(const std::string &classId) {
  return classId == "LMGT3" || classId == "GT3";
}

TrafficModifiers ComputeTrafficModifiers(const Car &self,
                                         const CarInteractionContext &ctx) {
  TrafficModifiers mods;
  if (ctx.field == nullptr || ctx.lapLength <= 0.0)
    return mods;

  const bool selfPrototype = IsPrototypeClass(self.raceClass().id);
  const bool selfGt = IsGtClass(self.raceClass().id);

  for (const Car &other : *ctx.field) {
    if (other.entryId() == self.entryId() || other.isRetired())
      continue;
    if (!WithinLapWindow(self, other))
      continue;

    const double aheadGap = GapAheadMeters(self, other, ctx.lapLength);
    const double behindGap = GapBehindMeters(self, other, ctx.lapLength);

    if (aheadGap > 0.0 && aheadGap < 220.0 && IsFasterCar(self, other)) {
      mods.blueFlag = true;
      mods.speedScale = std::min(mods.speedScale, 0.88);
    }

    if (behindGap > 0.0 && behindGap < 35.0 && IsFasterCar(other, self)) {
      mods.blocked = true;
      mods.speedScale = std::min(mods.speedScale, 0.94);
    }

    if (behindGap > 0.0 && behindGap < 80.0) {
      const bool otherPrototype = IsPrototypeClass(other.raceClass().id);
      const bool otherGt = IsGtClass(other.raceClass().id);
      if (selfPrototype && otherGt)
        mods.passDifficulty = std::max(mods.passDifficulty, 1.18);
      else if (selfGt && otherPrototype)
        mods.passDifficulty = std::max(mods.passDifficulty, 1.35);
      else if (selfGt && otherGt)
        mods.passDifficulty = std::max(mods.passDifficulty, 1.08);
    }
  }

  if (mods.passDifficulty > 1.0)
    mods.speedScale = std::min(mods.speedScale, 1.0 / mods.passDifficulty);

  return mods;
}
