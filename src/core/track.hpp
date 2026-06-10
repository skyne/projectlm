#ifndef TRACK_HPP
#define TRACK_HPP

#include <string>
#include <vector>

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

struct TrackSector {
  std::string name;
  double startDistance = 0.0;
  double endDistance = 0.0;
  double startT = 0.0;
  double endT = 0.0;
  double maxSafeSpeed = 0.0;
  bool isStraightaway = false;
  /** Optional sector width override (metres); <= 0 means use track default. */
  double widthM = 0.0;
};

struct TrackWidthSegment {
  std::string name;
  double startT = 0.0;
  double endT = 1.0;
  double widthM = 12.0;
};

struct PitLaneGeometry {
  double offsetM = 10.0;
};

enum class TrackSurfaceKind {
  Verge,
  KerbPositive,
  KerbNegative,
  KerbSausage,
  RunoffConcrete,
  RunoffAsphalt,
  Gravel,
  BarrierArmco,
  BarrierTecpro,
  BarrierWall
};

enum class TrackSurfaceSide { Inboard, Outboard, Both };

struct TrackSurfaceSegment {
  std::string name;
  double startT = 0.0;
  double endT = 1.0;
  TrackSurfaceSide side = TrackSurfaceSide::Outboard;
  TrackSurfaceKind surface = TrackSurfaceKind::RunoffConcrete;
  std::string variant;
  /** Band thickness (m). When width_start/end set, interpolated along segment. */
  double widthM = 11.0;
  double widthStartM = -1.0;
  double widthEndM = -1.0;
  /** Gap from asphalt edge before this band begins (verge / prior layer). */
  double innerOffsetM = 0.0;
  /** flat | flare_entry | flare_exit | bell — width shaping along segment. */
  std::string envelope;
  double gripMultiplier = 0.0;
};

struct TrackSurfaceDefaults {
  double vergeWidthM = 2.0;
  double runoffWidthM = 11.0;
  double kerbWidthM = 0.5;
};

struct TrackCorridorData {
  double defaultWidthM = 12.0;
  std::vector<TrackWidthSegment> widthProfile;
  PitLaneGeometry pitLane;
  TrackSurfaceDefaults surfaceDefaults;
  std::vector<TrackSurfaceSegment> surfaceProfile;
};

struct TrackPose {
  Vec3 position;
  Vec3 tangent;
  Vec3 up;
  double distance = 0.0;
  double normalizedT = 0.0;
  int sectorIndex = 0;
};

class TrackSpline {
public:
  void setControlPoints(const std::vector<Vec3> &points, bool closed);
  void setLinear(bool linear);
  void build(double sampleStep = 2.0);
  void setTargetLength(double length);

  double totalLength() const { return totalLength_; }
  bool isClosed() const { return closed_; }
  const std::vector<Vec3> &controlPoints() const { return controlPoints_; }

  TrackPose poseAtDistance(double distance) const;
  /** On-track pose; pre-start grid distances stay on the start straight. */
  TrackPose poseAtRaceDistance(double distance) const;
  TrackPose poseAtNormalizedT(double t) const;

private:
  Vec3 catmullRom(const Vec3 &p0, const Vec3 &p1, const Vec3 &p2,
                  const Vec3 &p3, double t) const;
  Vec3 catmullRomTangent(const Vec3 &p0, const Vec3 &p1, const Vec3 &p2,
                         const Vec3 &p3, double t) const;

  std::vector<Vec3> controlPoints_;
  std::vector<double> sampleDistances_;
  std::vector<Vec3> samplePositions_;
  std::vector<Vec3> sampleTangents_;
  double totalLength_ = 0.0;
  double lengthScale_ = 1.0;
  bool closed_ = true;
  bool built_ = false;
  bool linear_ = false;
};

struct PitLaneDefinition {
  TrackSpline spline;
  double speedLimitMs = 60.0 / 3.6;
  double boxDistance = 0.0;
  double mergeTrackDistance = 0.0;

  double totalLength() const { return spline.totalLength(); }
  bool valid() const { return totalLength() > 1.0; }
  TrackPose poseAtDistance(double distance) const;
};

struct TrackDefinition {
  std::string name;
  TrackSpline spline;
  PitLaneDefinition pitLane;
  TrackCorridorData corridor;
  std::vector<TrackSector> sectors;
  std::vector<Vec3> displayPolyline;

  double lapLength() const { return spline.totalLength(); }
  size_t sectorIndexAtDistance(double distance) const;
  const TrackSector &sectorAt(size_t index) const;
  TrackPose poseAtDistance(double distance) const;
  TrackPose poseAtRaceDistance(double distance) const;
  double curvatureAtDistance(double distance) const;
  double signedCurvatureAtDistance(double distance) const;
  double maxCurvatureAhead(double distance, double lookAheadMeters) const;
};

bool LoadTrack(const std::string &filename, TrackDefinition &track);

#endif
