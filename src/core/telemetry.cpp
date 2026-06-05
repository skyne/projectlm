#include "telemetry.hpp"
#include <fstream>
#include <iomanip>

void TelemetryLog::recordSectorCrossing(int sectorIndex, double time,
                                        double peakSpeed) {
  inProgress_.sectors.push_back({sectorIndex, time, peakSpeed});
}

void TelemetryLog::reset() {
  laps_.clear();
  inProgress_ = LapRecord{};
}

void TelemetryLog::completeLap(int lapNumber, double lapTime, double fuelAtEnd,
                               double engineHealthAtEnd) {
  inProgress_.lapNumber = lapNumber;
  inProgress_.lapTime = lapTime;
  inProgress_.fuelAtEnd = fuelAtEnd;
  inProgress_.engineHealthAtEnd = engineHealthAtEnd;
  laps_.push_back(inProgress_);
  inProgress_ = LapRecord{};
}

bool TelemetryLog::writeCsv(const std::string &path) const {
  std::ofstream out(path);
  if (!out)
    return false;

  out << "lap_number,sector_index,sector_time,peak_speed,lap_time,fuel_at_end,"
         "engine_health_at_end\n";

  for (const LapRecord &lap : laps_) {
    for (const SectorSplit &sector : lap.sectors) {
      out << lap.lapNumber << ',' << sector.sectorIndex << ','
          << std::fixed << std::setprecision(4) << sector.time << ','
          << sector.peakSpeed << ',' << lap.lapTime << ',' << lap.fuelAtEnd
          << ',' << lap.engineHealthAtEnd << '\n';
    }
  }

  return true;
}
