#include "track_perimeter_surfaces.hpp"
#include <algorithm>
#include <cmath>
#include <string>

namespace {

constexpr const char *kSynthPrefix = "synth:perimeter-";

bool IsBarrierSurface(TrackSurfaceKind kind) {
  return kind == TrackSurfaceKind::BarrierArmco ||
         kind == TrackSurfaceKind::BarrierTecpro ||
         kind == TrackSurfaceKind::BarrierWall;
}

bool IsSynthSegment(const TrackSurfaceSegment &seg) {
  return seg.name.rfind(kSynthPrefix, 0) == 0;
}

bool SideMatches(TrackSurfaceSide segSide, bool inboard) {
  if (segSide == TrackSurfaceSide::Both)
    return true;
  if (inboard)
    return segSide == TrackSurfaceSide::Inboard;
  return segSide == TrackSurfaceSide::Outboard;
}

double HalfWidthAtT(double t, double defaultWidthM,
                    const std::vector<TrackWidthSegment> &widthProfile) {
  for (const TrackWidthSegment &seg : widthProfile) {
    if (t >= seg.startT && t <= seg.endT)
      return seg.widthM * 0.5;
  }
  return defaultWidthM * 0.5;
}

double SegmentWidthAtT(const TrackSurfaceSegment &seg, double t) {
  const double w0 = seg.widthStartM >= 0.0 ? seg.widthStartM : seg.widthM;
  const double w1 = seg.widthEndM >= 0.0 ? seg.widthEndM : seg.widthM;
  const double span = std::max(seg.endT - seg.startT, 1e-9);
  const double u =
      std::clamp((t - seg.startT) / span, 0.0, 1.0);
  if (seg.envelope == "flare_exit")
    return w0 + (w1 - w0) * (u * u);
  if (seg.envelope == "flare_entry") {
    const double v = 1.0 - u;
    return w0 + (w1 - w0) * (1.0 - v * v);
  }
  if (seg.envelope == "bell")
    return w0 + (w1 - w0) * std::sin(u * M_PI);
  return w0 + (w1 - w0) * u;
}

double SegmentInnerEdgeM(double halfW, const TrackSurfaceSegment &seg,
                         double vergeWidthM) {
  const bool isKerb =
      seg.surface == TrackSurfaceKind::KerbPositive ||
      seg.surface == TrackSurfaceKind::KerbNegative ||
      seg.surface == TrackSurfaceKind::KerbSausage;
  const double verge = isKerb ? 0.0 : vergeWidthM;
  return halfW + seg.innerOffsetM + verge;
}

struct SideSampleState {
  double grassInnerOffsetM = 0.0;
  double grassWidthM = 0.0;
  double barrierInnerOffsetM = 0.0;
  double barrierWidthM = kPerimeterBarrierWidthM;
  bool synthBarrier = false;
};

bool StatesEqual(const SideSampleState &a, const SideSampleState &b,
                 double eps = 0.35) {
  return std::abs(a.grassInnerOffsetM - b.grassInnerOffsetM) < eps &&
         std::abs(a.grassWidthM - b.grassWidthM) < eps &&
         std::abs(a.barrierInnerOffsetM - b.barrierInnerOffsetM) < eps &&
         std::abs(a.barrierWidthM - b.barrierWidthM) < eps &&
         a.synthBarrier == b.synthBarrier;
}

SideSampleState SampleSideState(
    double t, bool inboard,
    const std::vector<TrackSurfaceSegment> &authored, double defaultWidthM,
    const std::vector<TrackWidthSegment> &widthProfile, double vergeWidthM) {
  const double halfW = HalfWidthAtT(t, defaultWidthM, widthProfile);
  double occupiedOuter = halfW;
  bool hasExplicitBarrier = false;
  double explicitBarrierInner = 0.0;
  double explicitBarrierWidth = kPerimeterBarrierWidthM;

  for (const TrackSurfaceSegment &seg : authored) {
    if (t < seg.startT || t > seg.endT)
      continue;
    if (!SideMatches(seg.side, inboard))
      continue;
    if (IsSynthSegment(seg))
      continue;

    const double inner = SegmentInnerEdgeM(halfW, seg, vergeWidthM);
    const double outer = inner + SegmentWidthAtT(seg, t);
    if (IsBarrierSurface(seg.surface)) {
      hasExplicitBarrier = true;
      explicitBarrierInner = inner;
      explicitBarrierWidth = seg.widthM;
    }
    occupiedOuter = std::max(occupiedOuter, outer);
  }

  SideSampleState state;
  double barrierInner = 0.0;
  if (hasExplicitBarrier) {
    barrierInner = explicitBarrierInner;
    state.barrierWidthM = explicitBarrierWidth;
    state.synthBarrier = false;
  } else if (occupiedOuter > halfW + 0.05) {
    barrierInner = occupiedOuter;
    state.barrierWidthM = kPerimeterBarrierWidthM;
    state.synthBarrier = true;
  } else {
    barrierInner = halfW + kPerimeterGrassGapM;
    state.barrierWidthM = kPerimeterBarrierWidthM;
    state.synthBarrier = true;
  }

  const double bandStart = std::max(occupiedOuter, halfW + vergeWidthM);
  state.grassInnerOffsetM = bandStart - halfW;
  state.grassWidthM = std::max(0.0, barrierInner - bandStart);
  state.barrierInnerOffsetM = barrierInner - halfW;
  return state;
}

} // namespace

std::vector<TrackSurfaceSegment>
SynthesizePerimeterSurfaces(const std::vector<TrackSurfaceSegment> &authoredIn,
                            const TrackSurfaceDefaults &defaults,
                            double defaultWidthM,
                            const std::vector<TrackWidthSegment> &widthProfile) {
  std::vector<TrackSurfaceSegment> authored;
  authored.reserve(authoredIn.size());
  for (const TrackSurfaceSegment &seg : authoredIn) {
    if (!IsSynthSegment(seg))
      authored.push_back(seg);
  }

  if (defaultWidthM <= 0.0)
    defaultWidthM = 12.0;
  const double vergeWidthM =
      defaults.vergeWidthM > 0.0 ? defaults.vergeWidthM : 2.0;
  const int sampleCount = std::max(64, kPerimeterSampleCount);

  std::vector<TrackSurfaceSegment> synth;
  for (bool inboard : {false, true}) {
    struct Sample {
      double t;
      SideSampleState state;
    };
    std::vector<Sample> samples;
    samples.reserve(static_cast<size_t>(sampleCount));
    for (int i = 0; i < sampleCount; ++i) {
      const double t = static_cast<double>(i) / sampleCount;
      samples.push_back(
          {t, SampleSideState(t, inboard, authored, defaultWidthM, widthProfile,
                              vergeWidthM)});
    }

    struct Interval {
      double startT;
      double endT;
      SideSampleState state;
    };
    std::vector<Interval> intervals;
    if (!samples.empty()) {
      double curStart = samples.front().t;
      SideSampleState curState = samples.front().state;
      for (size_t i = 1; i < samples.size(); ++i) {
        if (!StatesEqual(samples[i].state, curState)) {
          intervals.push_back({curStart, samples[i].t, curState});
          curStart = samples[i].t;
          curState = samples[i].state;
        }
      }
      intervals.push_back({curStart, 1.0, curState});
    }

    const char *sideLabel = inboard ? "inboard" : "outboard";
    for (const Interval &iv : intervals) {
      if (iv.endT <= iv.startT + 1e-6)
        continue;
      if (iv.state.grassWidthM > 0.15) {
        TrackSurfaceSegment grass;
        grass.name = std::string(kSynthPrefix) + "grass-" + sideLabel;
        grass.startT = iv.startT;
        grass.endT = iv.endT;
        grass.side = inboard ? TrackSurfaceSide::Inboard
                             : TrackSurfaceSide::Outboard;
        grass.surface = TrackSurfaceKind::Verge;
        grass.variant = "grass";
        grass.widthM = iv.state.grassWidthM;
        grass.innerOffsetM =
            std::max(0.0, iv.state.grassInnerOffsetM - vergeWidthM);
        grass.gripMultiplier = 0.28;
        synth.push_back(grass);
      }
      if (iv.state.synthBarrier && iv.state.barrierWidthM > 0.0) {
        TrackSurfaceSegment barrier;
        barrier.name = std::string(kSynthPrefix) + "barrier-" + sideLabel;
        barrier.startT = iv.startT;
        barrier.endT = iv.endT;
        barrier.side = inboard ? TrackSurfaceSide::Inboard
                               : TrackSurfaceSide::Outboard;
        barrier.surface = TrackSurfaceKind::BarrierTecpro;
        barrier.widthM = iv.state.barrierWidthM;
        barrier.innerOffsetM =
            std::max(0.0, iv.state.barrierInnerOffsetM - vergeWidthM);
        barrier.gripMultiplier = 0.0;
        synth.push_back(barrier);
      }
    }
  }

  std::vector<TrackSurfaceSegment> merged;
  merged.reserve(authored.size() + synth.size());
  merged.insert(merged.end(), authored.begin(), authored.end());
  merged.insert(merged.end(), synth.begin(), synth.end());
  return merged;
}
