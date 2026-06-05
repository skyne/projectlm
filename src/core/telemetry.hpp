#ifndef TELEMETRY_HPP
#define TELEMETRY_HPP

#include <string>
#include <vector>

struct SectorSplit {
  int sectorIndex = 0;
  double time = 0.0;
  double peakSpeed = 0.0;
};

struct LapRecord {
  int lapNumber = 0;
  double lapTime = 0.0;
  double fuelAtEnd = 0.0;
  double engineHealthAtEnd = 0.0;
  std::vector<SectorSplit> sectors;
};

class TelemetryLog {
public:
  void recordSectorCrossing(int sectorIndex, double time, double peakSpeed);
  void completeLap(int lapNumber, double lapTime, double fuelAtEnd,
                   double engineHealthAtEnd);
  void reset();
  bool writeCsv(const std::string &path) const;

  const std::vector<LapRecord> &laps() const { return laps_; }
  const LapRecord &inProgress() const { return inProgress_; }

private:
  std::vector<LapRecord> laps_;
  LapRecord inProgress_;
};

#endif
