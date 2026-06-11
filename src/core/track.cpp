#include "track.hpp"
#include "track_perimeter_surfaces.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <sstream>

static std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

static double VecLength(const Vec3 &v) {
  return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

static Vec3 VecNormalize(const Vec3 &v) {
  double len = VecLength(v);
  if (len < 1e-9)
    return {0.0, 0.0, 1.0};
  return {v.x / len, v.y / len, v.z / len};
}

static Vec3 VecCross(const Vec3 &a, const Vec3 &b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

static Vec3 VecAdd(const Vec3 &a, const Vec3 &b) {
  return {a.x + b.x, a.y + b.y, a.z + b.z};
}

static Vec3 VecSub(const Vec3 &a, const Vec3 &b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

static Vec3 VecScale(const Vec3 &v, double s) {
  return {v.x * s, v.y * s, v.z * s};
}

Vec3 TrackSpline::catmullRom(const Vec3 &p0, const Vec3 &p1, const Vec3 &p2,
                             const Vec3 &p3, double t) const {
  double t2 = t * t;
  double t3 = t2 * t;
  return VecAdd(
      VecAdd(VecScale(p0, -0.5 * t3 + t2 - 0.5 * t),
             VecScale(p1, 1.5 * t3 - 2.5 * t2 + 1.0)),
      VecAdd(VecScale(p2, -1.5 * t3 + 2.0 * t2 + 0.5 * t),
             VecScale(p3, 0.5 * t3 - 0.5 * t2)));
}

Vec3 TrackSpline::catmullRomTangent(const Vec3 &p0, const Vec3 &p1,
                                    const Vec3 &p2, const Vec3 &p3,
                                    double t) const {
  double t2 = t * t;
  return VecAdd(
      VecAdd(VecScale(p0, -1.5 * t2 + 2.0 * t - 0.5),
             VecScale(p1, 4.5 * t2 - 5.0 * t)),
      VecAdd(VecScale(p2, -4.5 * t2 + 4.0 * t + 0.5),
             VecScale(p3, 1.5 * t2 - 1.0 * t)));
}

void TrackSpline::setControlPoints(const std::vector<Vec3> &points,
                                   bool closed) {
  controlPoints_ = points;
  closed_ = closed;
  built_ = false;
}

void TrackSpline::setLinear(bool linear) { linear_ = linear; }

void TrackSpline::setTargetLength(double length) {
  if (!built_ || sampleDistances_.empty() || length <= 0.0)
    return;
  const double built = sampleDistances_.back();
  if (built <= 1e-6)
    return;
  const double scale = length / built;
  for (double &d : sampleDistances_)
    d *= scale;
  lengthScale_ = 1.0;
  totalLength_ = length;
}

void TrackSpline::build(double sampleStep) {
  sampleDistances_.clear();
  samplePositions_.clear();
  sampleTangents_.clear();
  lengthScale_ = 1.0;

  if (controlPoints_.size() < 2) {
    built_ = false;
    totalLength_ = 0.0;
    return;
  }

  const size_t n = controlPoints_.size();
  const size_t segmentCount = closed_ ? n : n - 1;

  if (linear_) {
    double accumulated = 0.0;
    Vec3 prevPos = controlPoints_[0];
    const Vec3 firstTan =
        VecNormalize(VecSub(controlPoints_[1 % n], controlPoints_[0]));
    sampleDistances_.push_back(0.0);
    samplePositions_.push_back(prevPos);
    sampleTangents_.push_back(firstTan);

    for (size_t seg = 0; seg < segmentCount; ++seg) {
      const Vec3 &p1 = controlPoints_[seg % n];
      const Vec3 &p2 = controlPoints_[(seg + 1) % n];
      const Vec3 edge = VecSub(p2, p1);
      const double edgeLen = VecLength(edge);
      if (edgeLen < 1e-9)
        continue;
      const Vec3 tan = VecNormalize(edge);
      const int steps =
          std::max(1, static_cast<int>(std::ceil(edgeLen / sampleStep)));

      for (int step = 1; step <= steps; ++step) {
        const double t = static_cast<double>(step) / steps;
        const Vec3 pos = VecAdd(VecScale(p1, 1.0 - t), VecScale(p2, t));
        const double segLen = VecLength(VecSub(pos, prevPos));
        if (segLen < 1e-9)
          continue;
        accumulated += segLen;
        sampleDistances_.push_back(accumulated);
        samplePositions_.push_back(pos);
        sampleTangents_.push_back(tan);
        prevPos = pos;
      }
    }

    totalLength_ = accumulated;
    built_ = !samplePositions_.empty();
    return;
  }

  const int stepsPerSegment =
      std::max(4, static_cast<int>(std::ceil(50.0 / sampleStep)));

  double accumulated = 0.0;
  Vec3 prevPos = catmullRom(
      controlPoints_[(n - 1) % n], controlPoints_[0], controlPoints_[1],
      controlPoints_[2 % n], 0.0);
  sampleDistances_.push_back(0.0);
  samplePositions_.push_back(prevPos);
  sampleTangents_.push_back(
      VecNormalize(catmullRomTangent(controlPoints_[(n - 1) % n],
                                     controlPoints_[0], controlPoints_[1],
                                     controlPoints_[2 % n], 0.0)));

  for (size_t seg = 0; seg < segmentCount; ++seg) {
    const Vec3 &p0 = controlPoints_[(seg + n - 1) % n];
    const Vec3 &p1 = controlPoints_[seg % n];
    const Vec3 &p2 = controlPoints_[(seg + 1) % n];
    const Vec3 &p3 = controlPoints_[(seg + 2) % n];

    for (int step = 1; step <= stepsPerSegment; ++step) {
      double t = static_cast<double>(step) / stepsPerSegment;
      Vec3 pos = catmullRom(p0, p1, p2, p3, t);
      Vec3 tan = VecNormalize(catmullRomTangent(p0, p1, p2, p3, t));
      double segLen = VecLength(VecSub(pos, prevPos));
      accumulated += segLen;
      sampleDistances_.push_back(accumulated);
      samplePositions_.push_back(pos);
      sampleTangents_.push_back(tan);
      prevPos = pos;
    }
  }

  totalLength_ = accumulated;
  built_ = true;
}

TrackPose TrackSpline::poseAtDistance(double distance) const {
  TrackPose pose;
  if (!built_ || sampleDistances_.empty() || totalLength_ < 1e-6)
    return pose;

  double d = std::fmod(distance, totalLength_);
  if (d < 0.0)
    d += totalLength_;

  auto it = std::lower_bound(sampleDistances_.begin(), sampleDistances_.end(), d);
  size_t idx = static_cast<size_t>(std::distance(sampleDistances_.begin(), it));
  if (idx >= samplePositions_.size())
    idx = samplePositions_.size() - 1;
  if (idx == 0)
    idx = 1;

  double d0 = sampleDistances_[idx - 1];
  double d1 = sampleDistances_[idx];
  double alpha = (d1 > d0) ? (d - d0) / (d1 - d0) : 0.0;

  const Vec3 &p0 = samplePositions_[idx - 1];
  const Vec3 &p1 = samplePositions_[idx];
  const Vec3 &t0 = sampleTangents_[idx - 1];
  const Vec3 &t1 = sampleTangents_[idx];

  pose.position =
      VecAdd(VecScale(p0, 1.0 - alpha), VecScale(p1, alpha));
  pose.tangent = VecNormalize(VecAdd(VecScale(t0, 1.0 - alpha), VecScale(t1, alpha)));
  pose.up = VecNormalize(VecCross(pose.tangent, {0.0, 1.0, 0.0}));
  if (VecLength(pose.up) < 1e-6)
    pose.up = {0.0, 1.0, 0.0};
  pose.distance = d;
  pose.normalizedT = d / totalLength_;
  return pose;
}

TrackPose TrackSpline::poseAtRaceDistance(double distance) const {
  if (distance >= 0.0)
    return poseAtDistance(distance);

  TrackPose start = poseAtDistance(0.0);
  TrackPose pose = start;
  pose.position = VecAdd(pose.position, VecScale(start.tangent, distance));
  pose.distance = distance;
  pose.normalizedT = 0.0;
  return pose;
}

TrackPose TrackSpline::poseAtNormalizedT(double t) const {
  return poseAtDistance(t * totalLength_);
}

size_t TrackDefinition::sectorIndexAtDistance(double distance) const {
  if (sectors.empty())
    return 0;
  if (distance < 0.0)
    return 0;
  double d = distance;
  if (lapLength() > 1e-6) {
    d = std::fmod(distance, lapLength());
    if (d < 0.0)
      d += lapLength();
  }
  for (size_t i = 0; i < sectors.size(); ++i) {
    if (d >= sectors[i].startDistance && d < sectors[i].endDistance)
      return i;
  }
  return sectors.size() - 1;
}

const TrackSector &TrackDefinition::sectorAt(size_t index) const {
  return sectors.at(index);
}

TrackPose TrackDefinition::poseAtDistance(double distance) const {
  TrackPose pose = spline.poseAtDistance(distance);
  pose.sectorIndex = static_cast<int>(sectorIndexAtDistance(distance));
  return pose;
}

TrackPose TrackDefinition::poseAtRaceDistance(double distance) const {
  TrackPose pose = spline.poseAtRaceDistance(distance);
  pose.sectorIndex = static_cast<int>(sectorIndexAtDistance(distance));
  return pose;
}

namespace {

double TangentHeading(const Vec3 &tangent) {
  return std::atan2(tangent.x, tangent.z);
}

double WrapAngle(double radians) {
  while (radians > M_PI)
    radians -= 2.0 * M_PI;
  while (radians < -M_PI)
    radians += 2.0 * M_PI;
  return radians;
}

} // namespace

double TrackDefinition::curvatureAtDistance(double distance) const {
  return std::abs(signedCurvatureAtDistance(distance));
}

double TrackDefinition::signedCurvatureAtDistance(double distance) const {
  const double ds = 6.0;
  const double sampleDistance = distance < 0.0 ? 0.0 : distance;
  const TrackPose behind = poseAtDistance(sampleDistance - ds);
  const TrackPose ahead = poseAtDistance(sampleDistance + ds);
  const double delta =
      WrapAngle(TangentHeading(ahead.tangent) - TangentHeading(behind.tangent));
  return delta / (2.0 * ds);
}

double TrackDefinition::maxCurvatureAhead(double distance,
                                         double lookAheadMeters) const {
  const double sampleDistance = distance < 0.0 ? 0.0 : distance;
  if (lookAheadMeters <= 0.0)
    return curvatureAtDistance(sampleDistance);

  const double step = 8.0;
  double maxKappa = 0.0;
  for (double offset = 0.0; offset <= lookAheadMeters; offset += step)
    maxKappa =
        std::max(maxKappa, curvatureAtDistance(sampleDistance + offset));
  return maxKappa;
}

static void ResolveSectorDistances(TrackDefinition &track, double lapLength) {
  for (TrackSector &sector : track.sectors) {
    sector.startDistance = sector.startT * lapLength;
    sector.endDistance = sector.endT * lapLength;
  }
}

static void SkipWs(const std::string &s, size_t &i);
static bool ParseString(const std::string &s, size_t &i, std::string &out);
static bool ParseNumber(const std::string &s, size_t &i, double &out);
static bool SkipJsonValue(const std::string &s, size_t &i);
static bool Expect(const std::string &s, size_t &i, char c);

TrackPose PitLaneDefinition::poseAtDistance(double distance) const {
  return spline.poseAtDistance(distance);
}

static PitLanePointRole ParsePitLanePointRole(const std::string &token) {
  if (token == "entry")
    return PitLanePointRole::Entry;
  if (token == "box")
    return PitLanePointRole::Box;
  if (token == "exit")
    return PitLanePointRole::Exit;
  return PitLanePointRole::Waypoint;
}

static bool ParsePitLanePointObject(const std::string &s, size_t &i,
                                    PitLanePoint &point) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "x") {
      if (!ParseNumber(s, i, point.position.x))
        return false;
    } else if (key == "y") {
      if (!ParseNumber(s, i, point.position.y))
        return false;
    } else if (key == "z") {
      if (!ParseNumber(s, i, point.position.z))
        return false;
    } else if (key == "role") {
      std::string roleToken;
      if (!ParseString(s, i, roleToken))
        return false;
      point.role = ParsePitLanePointRole(roleToken);
    } else {
      if (!SkipJsonValue(s, i))
        return false;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParsePitLanePolylineArray(const std::string &s, size_t &i,
                                      std::vector<PitLanePoint> &polyline) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    PitLanePoint point;
    if (!ParsePitLanePointObject(s, i, point))
      return false;
    polyline.push_back(point);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static double ChordLengthBetween(const Vec3 &a, const Vec3 &b) {
  const double dx = b.x - a.x;
  const double dy = b.y - a.y;
  const double dz = b.z - a.z;
  return std::sqrt(dx * dx + dy * dy + dz * dz);
}

static double PitBoxDistanceFromPolyline(
    const std::vector<PitLanePoint> &polyline, double totalLength) {
  if (polyline.size() < 2 || totalLength <= 0.0)
    return 0.0;

  size_t boxIdx = polyline.size();
  for (size_t i = 0; i < polyline.size(); ++i) {
    if (polyline[i].role == PitLanePointRole::Box) {
      boxIdx = i;
      break;
    }
  }
  if (boxIdx >= polyline.size())
    return totalLength * 0.48;

  double accum = 0.0;
  double chordTotal = 0.0;
  for (size_t i = 1; i < polyline.size(); ++i) {
    const double seg =
        ChordLengthBetween(polyline[i - 1].position, polyline[i].position);
    chordTotal += seg;
    if (i <= boxIdx)
      accum = chordTotal;
  }
  if (chordTotal < 1e-6)
    return totalLength * 0.48;
  return (accum / chordTotal) * totalLength;
}

static PitLaneGeometry GenerateDefaultPitLaneGeometry(
    const TrackDefinition &track, const PitLaneGeometry &hints) {
  PitLaneGeometry geom = hints;
  geom.entryT = geom.entryT > 0.0 ? geom.entryT : 0.985;
  geom.exitT = geom.exitT > 0.0 ? geom.exitT : 0.06;
  if (geom.speedLimitMs <= 0.0)
    geom.speedLimitMs = 60.0 / 3.6;

  const double lapLen = track.lapLength();
  if (lapLen <= 0.0)
    return geom;

  constexpr double kSampleStepM = 12.0;
  const double kLateralOffsetM =
      geom.offsetM > 0.0 ? geom.offsetM : 10.0;

  const double entryDist = geom.entryT * lapLen;
  const double exitDist = geom.exitT * lapLen;
  double pitSpan = 0.0;
  if (track.spline.isClosed()) {
    pitSpan = exitDist >= entryDist ? exitDist - entryDist
                                    : (lapLen - entryDist) + exitDist;
  } else {
    pitSpan = exitDist >= entryDist ? exitDist - entryDist
                                    : std::max(0.0, lapLen - entryDist);
  }

  geom.polyline.clear();
  for (double d = 0.0; d <= pitSpan + 1e-6; d += kSampleStepM) {
    const double along = std::min(d, pitSpan);
    const TrackPose pose = track.spline.poseAtDistance(entryDist + along);
    Vec3 perp = {-pose.tangent.z, 0.0, pose.tangent.x};
    perp = VecNormalize(perp);
    PitLanePoint point;
    point.position = VecAdd(pose.position, VecScale(perp, kLateralOffsetM));
    point.role = PitLanePointRole::Waypoint;
    geom.polyline.push_back(point);
    if (along >= pitSpan - 1e-6)
      break;
  }
  if (geom.polyline.size() >= 2) {
    geom.polyline.front().role = PitLanePointRole::Entry;
    geom.polyline.back().role = PitLanePointRole::Exit;
    const size_t boxIdx =
        static_cast<size_t>(std::round((geom.polyline.size() - 1) * 0.48));
    geom.polyline[boxIdx].role = PitLanePointRole::Box;
  }
  geom.boxDistanceM = -1.0;
  return geom;
}

static void ApplyPitLaneFromGeometry(TrackDefinition &track,
                                     const PitLaneGeometry &geom) {
  if (geom.polyline.size() < 2)
    return;

  std::vector<Vec3> points;
  points.reserve(geom.polyline.size());
  for (const PitLanePoint &point : geom.polyline)
    points.push_back(point.position);

  track.pitLane.spline.setControlPoints(points, false);
  track.pitLane.spline.setLinear(true);
  track.pitLane.spline.build(2.0);

  const double lapLen = track.lapLength();
  const double exitT = geom.exitT > 0.0 ? geom.exitT : 0.06;
  track.pitLane.speedLimitMs =
      geom.speedLimitMs > 0.0 ? geom.speedLimitMs : 60.0 / 3.6;
  track.pitLane.entryT = geom.entryT > 0.0 ? geom.entryT : 0.985;
  track.pitLane.exitT = exitT;
  track.pitLane.mergeLateralOffset =
      geom.mergeLateralOffset > 0.0 ? geom.mergeLateralOffset : 0.58;
  track.pitLane.mergeTrackDistance = exitT * lapLen;
  track.pitLane.boxDistance =
      geom.boxDistanceM >= 0.0
          ? geom.boxDistanceM
          : PitBoxDistanceFromPolyline(geom.polyline,
                                       track.pitLane.totalLength());
}

static std::vector<Vec3> DefaultCircuitControlPoints() {
  return {
      {0.0, 0.0, 0.0},       {0.0, 0.0, 2800.0},    {400.0, 0.0, 4200.0},
      {1400.0, 0.0, 5000.0}, {3000.0, 0.0, 5200.0}, {4600.0, 0.0, 4800.0},
      {5600.0, 0.0, 3600.0}, {5800.0, 0.0, 2000.0}, {5600.0, 0.0, 600.0},
      {4200.0, 0.0, -600.0}, {2400.0, 0.0, -1200.0}, {800.0, 0.0, -800.0},
      {200.0, 0.0, -200.0},
  };
}

static bool LoadLegacyTrackCsv(const std::string &filename,
                               TrackDefinition &track) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;

  double nominalLength = 0.0;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty())
      continue;
    std::stringstream ss(line);
    std::string val;
    TrackSector sector;
    std::getline(ss, val, ',');
    sector.startDistance = std::stod(val);
    std::getline(ss, val, ',');
    double length = std::stod(val);
    sector.endDistance = sector.startDistance + length;
    std::getline(ss, val, ',');
    sector.maxSafeSpeed = std::stod(val);
    std::getline(ss, val, ',');
    sector.isStraightaway = (std::stoi(val) == 1);
    sector.name = "S" + std::to_string(track.sectors.size());
    track.sectors.push_back(sector);
    nominalLength = sector.endDistance;
  }

  if (track.sectors.empty())
    return false;

  track.name = "Legacy Import";
  track.spline.setControlPoints(DefaultCircuitControlPoints(), true);
  track.spline.build(2.0);
  track.spline.setTargetLength(nominalLength);
  ResolveSectorDistances(track, nominalLength);
  PitLaneGeometry pitGeom = GenerateDefaultPitLaneGeometry(track, {});
  ApplyPitLaneFromGeometry(track, pitGeom);
  return true;
}

static void SkipWs(const std::string &s, size_t &i) {
  while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' ||
                          s[i] == '\r'))
    ++i;
}

static bool ParseString(const std::string &s, size_t &i, std::string &out) {
  SkipWs(s, i);
  if (i >= s.size() || s[i] != '"')
    return false;
  ++i;
  out.clear();
  while (i < s.size() && s[i] != '"') {
    if (s[i] == '\\' && i + 1 < s.size())
      ++i;
    out.push_back(s[i++]);
  }
  if (i >= s.size() || s[i] != '"')
    return false;
  ++i;
  return true;
}

static bool ParseNumber(const std::string &s, size_t &i, double &out) {
  SkipWs(s, i);
  size_t start = i;
  while (i < s.size() &&
         (std::isdigit(static_cast<unsigned char>(s[i])) || s[i] == '-' ||
          s[i] == '+' || s[i] == '.' || s[i] == 'e' || s[i] == 'E'))
    ++i;
  if (start == i)
    return false;
  out = std::stod(s.substr(start, i - start));
  return true;
}

static bool ParseBool(const std::string &s, size_t &i, bool &out) {
  SkipWs(s, i);
  if (s.compare(i, 4, "true") == 0) {
    out = true;
    i += 4;
    return true;
  }
  if (s.compare(i, 5, "false") == 0) {
    out = false;
    i += 5;
    return true;
  }
  return false;
}

static bool Expect(const std::string &s, size_t &i, char c) {
  SkipWs(s, i);
  if (i >= s.size() || s[i] != c)
    return false;
  ++i;
  return true;
}

static bool SkipJsonValue(const std::string &s, size_t &i) {
  SkipWs(s, i);
  if (i >= s.size())
    return false;

  if (s[i] == '"') {
    std::string ignored;
    return ParseString(s, i, ignored);
  }
  if (s[i] == '{') {
    if (!Expect(s, i, '{'))
      return false;
    while (true) {
      SkipWs(s, i);
      if (i < s.size() && s[i] == '}')
        return ++i, true;
      std::string key;
      if (!ParseString(s, i, key) || !Expect(s, i, ':'))
        return false;
      if (!SkipJsonValue(s, i))
        return false;
      SkipWs(s, i);
      if (i < s.size() && s[i] == ',')
        ++i;
    }
  }
  if (s[i] == '[') {
    if (!Expect(s, i, '['))
      return false;
    while (true) {
      SkipWs(s, i);
      if (i < s.size() && s[i] == ']')
        return ++i, true;
      if (!SkipJsonValue(s, i))
        return false;
      SkipWs(s, i);
      if (i < s.size() && s[i] == ',')
        ++i;
    }
  }
  if (s.compare(i, 4, "true") == 0) {
    i += 4;
    return true;
  }
  if (s.compare(i, 5, "false") == 0) {
    i += 5;
    return true;
  }
  if (s.compare(i, 4, "null") == 0) {
    i += 4;
    return true;
  }

  double ignored = 0.0;
  return ParseNumber(s, i, ignored);
}

static bool ParseVec3Object(const std::string &s, size_t &i, Vec3 &v) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    double num = 0.0;
    if (!ParseNumber(s, i, num))
      return false;
    if (key == "x")
      v.x = num;
    else if (key == "y")
      v.y = num;
    else if (key == "z")
      v.z = num;
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseControlPointsArray(const std::string &s, size_t &i,
                                    std::vector<Vec3> &points) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    Vec3 v;
    if (!ParseVec3Object(s, i, v))
      return false;
    points.push_back(v);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseSectorObject(const std::string &s, size_t &i,
                              TrackSector &sector) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "name") {
      if (!ParseString(s, i, sector.name))
        return false;
    } else if (key == "start_t") {
      if (!ParseNumber(s, i, sector.startT))
        return false;
    } else if (key == "end_t") {
      if (!ParseNumber(s, i, sector.endT))
        return false;
    } else if (key == "max_speed_ms") {
      if (!ParseNumber(s, i, sector.maxSafeSpeed))
        return false;
    } else if (key == "straight") {
      if (!ParseBool(s, i, sector.isStraightaway))
        return false;
    } else if (key == "width_m") {
      if (!ParseNumber(s, i, sector.widthM))
        return false;
    } else {
      while (i < s.size() && s[i] != ',' && s[i] != '}')
        ++i;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseWidthSegmentObject(const std::string &s, size_t &i,
                                  TrackWidthSegment &segment) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "name") {
      if (!ParseString(s, i, segment.name))
        return false;
    } else if (key == "start_t") {
      if (!ParseNumber(s, i, segment.startT))
        return false;
    } else if (key == "end_t") {
      if (!ParseNumber(s, i, segment.endT))
        return false;
    } else if (key == "width_m") {
      if (!ParseNumber(s, i, segment.widthM))
        return false;
    } else {
      while (i < s.size() && s[i] != ',' && s[i] != '}')
        ++i;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseSurfaceKind(const std::string &token, TrackSurfaceKind &kind) {
  if (token == "verge")
    kind = TrackSurfaceKind::Verge;
  else if (token == "kerb_positive")
    kind = TrackSurfaceKind::KerbPositive;
  else if (token == "kerb_negative")
    kind = TrackSurfaceKind::KerbNegative;
  else if (token == "kerb_sausage")
    kind = TrackSurfaceKind::KerbSausage;
  else if (token == "runoff_concrete")
    kind = TrackSurfaceKind::RunoffConcrete;
  else if (token == "runoff_asphalt")
    kind = TrackSurfaceKind::RunoffAsphalt;
  else if (token == "gravel")
    kind = TrackSurfaceKind::Gravel;
  else if (token == "barrier_armco")
    kind = TrackSurfaceKind::BarrierArmco;
  else if (token == "barrier_tecpro")
    kind = TrackSurfaceKind::BarrierTecpro;
  else if (token == "barrier_wall")
    kind = TrackSurfaceKind::BarrierWall;
  else
    return false;
  return true;
}

static bool ParseSurfaceSide(const std::string &token, TrackSurfaceSide &side) {
  if (token == "inboard")
    side = TrackSurfaceSide::Inboard;
  else if (token == "outboard")
    side = TrackSurfaceSide::Outboard;
  else if (token == "both")
    side = TrackSurfaceSide::Both;
  else
    return false;
  return true;
}

static bool ParseSurfaceSegmentObject(const std::string &s, size_t &i,
                                      TrackSurfaceSegment &segment) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "name") {
      if (!ParseString(s, i, segment.name))
        return false;
    } else if (key == "start_t") {
      if (!ParseNumber(s, i, segment.startT))
        return false;
    } else if (key == "end_t") {
      if (!ParseNumber(s, i, segment.endT))
        return false;
    } else if (key == "side") {
      std::string sideToken;
      if (!ParseString(s, i, sideToken) ||
          !ParseSurfaceSide(sideToken, segment.side))
        return false;
    } else if (key == "surface") {
      std::string surfaceToken;
      if (!ParseString(s, i, surfaceToken) ||
          !ParseSurfaceKind(surfaceToken, segment.surface))
        return false;
    } else if (key == "variant") {
      if (!ParseString(s, i, segment.variant))
        return false;
    } else if (key == "width_m") {
      if (!ParseNumber(s, i, segment.widthM))
        return false;
    } else if (key == "width_start_m") {
      if (!ParseNumber(s, i, segment.widthStartM))
        return false;
    } else if (key == "width_end_m") {
      if (!ParseNumber(s, i, segment.widthEndM))
        return false;
    } else if (key == "inner_offset_m") {
      if (!ParseNumber(s, i, segment.innerOffsetM))
        return false;
    } else if (key == "envelope") {
      if (!ParseString(s, i, segment.envelope))
        return false;
    } else if (key == "grip_multiplier") {
      if (!ParseNumber(s, i, segment.gripMultiplier))
        return false;
    } else {
      while (i < s.size() && s[i] != ',' && s[i] != '}')
        ++i;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseSurfaceProfileArray(const std::string &s, size_t &i,
                                     std::vector<TrackSurfaceSegment> &profile) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    TrackSurfaceSegment segment;
    if (!ParseSurfaceSegmentObject(s, i, segment))
      return false;
    profile.push_back(segment);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseSurfaceDefaultsObject(const std::string &s, size_t &i,
                                       TrackSurfaceDefaults &defaults) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "verge_width_m") {
      if (!ParseNumber(s, i, defaults.vergeWidthM))
        return false;
    } else if (key == "runoff_width_m") {
      if (!ParseNumber(s, i, defaults.runoffWidthM))
        return false;
    } else if (key == "kerb_width_m") {
      if (!ParseNumber(s, i, defaults.kerbWidthM))
        return false;
    } else {
      if (!SkipJsonValue(s, i))
        return false;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseWidthProfileArray(const std::string &s, size_t &i,
                                   std::vector<TrackWidthSegment> &profile) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    TrackWidthSegment segment;
    if (!ParseWidthSegmentObject(s, i, segment))
      return false;
    profile.push_back(segment);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParsePitLaneObject(const std::string &s, size_t &i,
                               PitLaneGeometry &geometry) {
  if (!Expect(s, i, '{'))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == '}')
      return ++i, true;
    std::string key;
    if (!ParseString(s, i, key) || !Expect(s, i, ':'))
      return false;
    if (key == "offset_m") {
      if (!ParseNumber(s, i, geometry.offsetM))
        return false;
    } else if (key == "width_m") {
      if (!ParseNumber(s, i, geometry.widthM))
        return false;
    } else if (key == "merge_lateral_offset") {
      if (!ParseNumber(s, i, geometry.mergeLateralOffset))
        return false;
    } else if (key == "merge_blend_m") {
      if (!ParseNumber(s, i, geometry.mergeBlendM))
        return false;
    } else if (key == "entry_t") {
      if (!ParseNumber(s, i, geometry.entryT))
        return false;
    } else if (key == "exit_t") {
      if (!ParseNumber(s, i, geometry.exitT))
        return false;
    } else if (key == "box_distance_m") {
      if (!ParseNumber(s, i, geometry.boxDistanceM))
        return false;
    } else if (key == "speed_limit_ms") {
      if (!ParseNumber(s, i, geometry.speedLimitMs))
        return false;
    } else if (key == "polyline") {
      if (!ParsePitLanePolylineArray(s, i, geometry.polyline))
        return false;
    } else {
      if (!SkipJsonValue(s, i))
        return false;
    }
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool ParseSectorsArray(const std::string &s, size_t &i,
                              std::vector<TrackSector> &sectors) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    TrackSector sector;
    if (!ParseSectorObject(s, i, sector))
      return false;
    sectors.push_back(sector);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
  }
}

static bool LoadTrackJson(const std::string &filename, TrackDefinition &track) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::stringstream buffer;
  buffer << file.rdbuf();
  const std::string content = buffer.str();

  std::vector<Vec3> controlPoints;
  std::vector<Vec3> displayPolyline;
  std::vector<TrackSector> sectors;
  std::vector<TrackWidthSegment> widthProfile;
  std::vector<TrackSurfaceSegment> surfaceProfile;
  TrackSurfaceDefaults surfaceDefaults;
  PitLaneGeometry pitLaneGeometry;
  bool closed = true;
  bool linear = false;
  double targetLength = 0.0;
  double trackWidthM = 12.0;
  std::string name;

  size_t i = 0;
  if (!Expect(content, i, '{'))
    return false;
  while (true) {
    SkipWs(content, i);
    if (i < content.size() && content[i] == '}')
      break;
    std::string key;
    if (!ParseString(content, i, key) || !Expect(content, i, ':'))
      return false;
    if (key == "name") {
      if (!ParseString(content, i, name))
        return false;
    } else if (key == "closed") {
      if (!ParseBool(content, i, closed))
        return false;
    } else if (key == "lap_length") {
      if (!ParseNumber(content, i, targetLength))
        return false;
    } else if (key == "control_points") {
      if (!ParseControlPointsArray(content, i, controlPoints))
        return false;
    } else if (key == "display_polyline") {
      if (!ParseControlPointsArray(content, i, displayPolyline))
        return false;
    } else if (key == "interpolation") {
      std::string mode;
      if (!ParseString(content, i, mode))
        return false;
      linear = (mode == "linear");
    } else if (key == "sectors") {
      if (!ParseSectorsArray(content, i, sectors))
        return false;
    } else if (key == "track_width_m") {
      if (!ParseNumber(content, i, trackWidthM))
        return false;
    } else if (key == "width_profile") {
      if (!ParseWidthProfileArray(content, i, widthProfile))
        return false;
    } else if (key == "pit_lane") {
      if (!ParsePitLaneObject(content, i, pitLaneGeometry))
        return false;
    } else if (key == "surface_profile") {
      if (!ParseSurfaceProfileArray(content, i, surfaceProfile))
        return false;
    } else if (key == "surface_defaults") {
      if (!ParseSurfaceDefaultsObject(content, i, surfaceDefaults))
        return false;
    } else {
      if (!SkipJsonValue(content, i))
        return false;
    }
    SkipWs(content, i);
    if (i < content.size() && content[i] == ',')
      ++i;
  }

  if (controlPoints.size() < 3 || sectors.empty())
    return false;

  track.name = name.empty() ? "Unnamed Track" : name;
  track.sectors = sectors;
  track.displayPolyline = displayPolyline;
  track.corridor.defaultWidthM = trackWidthM;
  track.corridor.widthProfile = widthProfile;
  track.corridor.surfaceProfile = SynthesizePerimeterSurfaces(
      surfaceProfile, surfaceDefaults,
      trackWidthM > 0.0 ? trackWidthM : 12.0, widthProfile);
  track.corridor.surfaceDefaults = surfaceDefaults;
  track.corridor.pitLane = pitLaneGeometry;
  track.spline.setControlPoints(controlPoints, closed);
  track.spline.setLinear(linear);
  track.spline.build(2.0);
  if (targetLength > 0.0)
    track.spline.setTargetLength(targetLength);
  ResolveSectorDistances(track, track.spline.totalLength());
  PitLaneGeometry pitGeom = pitLaneGeometry;
  if (pitGeom.polyline.size() < 2)
    pitGeom = GenerateDefaultPitLaneGeometry(track, pitLaneGeometry);
  track.corridor.pitLane = pitGeom;
  ApplyPitLaneFromGeometry(track, pitGeom);
  return true;
}

bool LoadTrack(const std::string &filename, TrackDefinition &track) {
  if (filename.size() >= 5 &&
      filename.substr(filename.size() - 5) == ".json")
    return LoadTrackJson(filename, track);
  return LoadLegacyTrackCsv(filename, track);
}
