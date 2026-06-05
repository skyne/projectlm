#include "track_sampler.hpp"
#include <cmath>
#include <fstream>
#include <sstream>

namespace {

void SkipWs(const std::string &s, size_t &i) {
  while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i])))
    ++i;
}

bool ParseString(const std::string &s, size_t &i, std::string &out) {
  SkipWs(s, i);
  if (i >= s.size() || s[i] != '"')
    return false;
  ++i;
  out.clear();
  while (i < s.size() && s[i] != '"') {
    if (s[i] == '\\' && i + 1 < s.size()) {
      out.push_back(s[++i]);
    } else {
      out.push_back(s[i]);
    }
    ++i;
  }
  if (i >= s.size() || s[i] != '"')
    return false;
  ++i;
  return true;
}

bool ParseNumber(const std::string &s, size_t &i, double &out) {
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

bool Expect(const std::string &s, size_t &i, char c) {
  SkipWs(s, i);
  if (i >= s.size() || s[i] != c)
    return false;
  ++i;
  return true;
}

bool ParsePointXZ(const std::string &s, size_t &i, TrackGeometryPoint &pt) {
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
      pt.x = num;
    else if (key == "z")
      pt.z = num;
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',')
      ++i;
  }
}

bool ParsePolylineArray(const std::string &s, size_t &i,
                        std::vector<TrackGeometryPoint> &points) {
  if (!Expect(s, i, '['))
    return false;
  while (true) {
    SkipWs(s, i);
    if (i < s.size() && s[i] == ']')
      return ++i, true;
    TrackGeometryPoint pt;
    if (!ParsePointXZ(s, i, pt))
      return false;
    points.push_back(pt);
    SkipWs(s, i);
    if (i < s.size() && s[i] == ',')
      ++i;
  }
}

void DownsampleOutline(std::vector<TrackGeometryPoint> &points,
                       size_t maxPoints) {
  if (points.size() <= maxPoints)
    return;
  std::vector<TrackGeometryPoint> reduced;
  reduced.reserve(maxPoints);
  const size_t n = points.size();
  for (size_t i = 0; i < maxPoints; ++i) {
    size_t idx = (i * (n - 1)) / (maxPoints - 1);
    reduced.push_back(points[idx]);
  }
  points = std::move(reduced);
}

} // namespace

std::string OutlinePathForTrack(const std::string &trackJsonPath) {
  const size_t dot = trackJsonPath.rfind('.');
  if (dot == std::string::npos)
    return trackJsonPath + "_outline.json";
  return trackJsonPath.substr(0, dot) + "_outline.json";
}

bool LoadTrackOutline(const std::string &outlinePath,
                      const TrackDefinition &track, TrackGeometry &geometry) {
  std::ifstream file(outlinePath);
  if (!file.is_open())
    return false;

  std::stringstream buffer;
  buffer << file.rdbuf();
  const std::string content = buffer.str();

  std::vector<TrackGeometryPoint> polyline;
  double lapLength = track.lapLength();
  std::string name = track.name;

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
      ParseString(content, i, name);
    } else if (key == "lap_length") {
      ParseNumber(content, i, lapLength);
    } else if (key == "polyline") {
      if (!ParsePolylineArray(content, i, polyline))
        return false;
    } else {
      while (i < content.size() && content[i] != ',' && content[i] != '}')
        ++i;
    }
    SkipWs(content, i);
    if (i < content.size() && content[i] == ',')
      ++i;
  }

  if (polyline.size() < 3)
    return false;

  DownsampleOutline(polyline, 900);

  geometry.name = name;
  geometry.lapLength = lapLength;
  geometry.points = std::move(polyline);
  geometry.sectors.clear();
  for (const TrackSector &sector : track.sectors) {
    TrackGeometrySector geoSector;
    geoSector.name = sector.name;
    geoSector.startT = sector.startT;
    geoSector.endT = sector.endT;
    geometry.sectors.push_back(std::move(geoSector));
  }
  return true;
}

TrackGeometry SampleTrackXZ(const TrackDefinition &track, double stepMeters) {
  TrackGeometry geometry;
  geometry.name = track.name;
  geometry.lapLength = track.lapLength();

  for (const TrackSector &sector : track.sectors) {
    TrackGeometrySector geoSector;
    geoSector.name = sector.name;
    geoSector.startT = sector.startT;
    geoSector.endT = sector.endT;
    geometry.sectors.push_back(std::move(geoSector));
  }

  if (!track.displayPolyline.empty()) {
    geometry.points.reserve(track.displayPolyline.size());
    for (const Vec3 &point : track.displayPolyline)
      geometry.points.push_back({point.x, point.z});
    if (geometry.points.size() > 1) {
      const TrackGeometryPoint &first = geometry.points.front();
      const TrackGeometryPoint &last = geometry.points.back();
      const double gap =
          std::hypot(last.x - first.x, last.z - first.z);
      if (gap > 1.0)
        geometry.points.push_back(first);
    }
    return geometry;
  }

  if (geometry.lapLength <= 0.0 || stepMeters <= 0.0)
    return geometry;

  for (double distance = 0.0; distance < geometry.lapLength;
       distance += stepMeters) {
    const TrackPose pose = track.poseAtDistance(distance);
    geometry.points.push_back({pose.position.x, pose.position.z});
  }

  if (geometry.points.empty()) {
    const TrackPose pose = track.poseAtDistance(0.0);
    geometry.points.push_back({pose.position.x, pose.position.z});
  } else {
    const TrackGeometryPoint &first = geometry.points.front();
    const TrackGeometryPoint &last = geometry.points.back();
    const double gap =
        std::hypot(last.x - first.x, last.z - first.z);
    if (gap > 1.0)
      geometry.points.push_back(first);
  }

  return geometry;
}
