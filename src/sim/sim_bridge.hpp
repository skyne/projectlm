#ifndef SIM_BRIDGE_HPP
#define SIM_BRIDGE_HPP

#include "car_entity.hpp"
#include "race.hpp"
#include "race_control.hpp"
#include "team_config.hpp"
#include "weather.hpp"
#include "track_sampler.hpp"
#include <string>
#include <vector>

struct RaceConfig;
struct SimCheckpointV1;

struct RaceControlState {
  bool fcyActive = false;
  bool scActive = false;
  std::string flagPhase = "green";
  std::vector<int> sectorFlags;
  std::string activeIncidentEntryId;
  int scLapsRemaining = 0;
  int obstructionsOnTrack = 0;
  bool whiteFlagActive = false;
  bool redFlagActive = false;
  double redFlagSecondsRemaining = 0.0;
  std::string redFlagReason;
  struct SurfaceHazardSummary {
    int sectorIndex = 0;
    std::string kind;
    double gripMultiplier = 1.0;
    double centerDistance = 0.0;
    double centerLateralM = 0.0;
    double spanMeters = 0.0;
    double lateralSpanM = 0.0;
  };
  std::vector<SurfaceHazardSummary> surfaceHazards;
  double trackWetness = 0.0;
  double ambientTempC = 22.0;
  double trackTempC = 22.0;
  double trackGripEvolution = 1.0;
  double rainIntensity = 0.0;
  double windSpeedMs = 3.0;
  double windDirectionDeg = 270.0;
  double visibilityKm = 10.0;
  std::string weatherPhase = "Dry";
  double forecastRainInSeconds = -1.0;
  std::string weatherLabel;
  std::string weatherBiome;
  struct ForecastStep {
    double offsetMinutes = 0.0;
    std::string phase;
    double trackWetness = 0.0;
    double rainIntensity = 0.0;
    double ambientTempC = 22.0;
    double trackTempC = 22.0;
    double windSpeedMs = 3.0;
    double windDirectionDeg = 270.0;
    double visibilityKm = 10.0;
  };
  std::vector<ForecastStep> forecast;
};

enum class SimEventType {
  SectorCross,
  LapComplete,
  PitEnter,
  PitExit,
  Retirement,
  RaceComplete,
  Overtake,
  Collision,
  Blocked,
  CommandAck,
  Stranded,
  RecoveryDispatched,
  TrackClear,
  SurfaceHazard,
  SurfaceCleared,
  BlueFlag,
  PenaltyIssued,
  PenaltyWarning,
  RacingIncident,
  DriveThroughServed,
  StopGoServed,
  MeatballFlag,
  BlackFlag,
  Disqualified,
  SlowZone,
  FcyDeploy,
  FcyEnd,
  SafetyCarDeploy,
  SafetyCarInThisLap,
  GreenFlag,
  WhiteFlag,
  RedFlagDeploy,
  RedFlagExtended,
  RedFlagEnd
};

struct SimEvent {
  SimEventType type = SimEventType::SectorCross;
  std::string entryId;
  std::string otherEntryId;
  int lap = 0;
  int sectorIndex = 0;
  double timestamp = 0.0;
  std::string message;
  double collisionImpact = 0.0;
  double collisionBaseImpact = 0.0;
  int collisionContactSide = 0;
};

class SimBridge {
public:
  bool initFromRaceConfig(const std::string &raceConfigPath);
  bool initSession(RaceSession &&session);
  bool reloadDefinitions();
  bool restartRace();

  void tick(double deltaTime);

  std::vector<CarSnapshot> getSnapshots() const;
  std::vector<SimEvent> drainEvents();
  TrackGeometry getTrackGeometry() const;
  bool isRaceComplete() const;
  double getRaceTime() const { return session_.elapsedRaceTime; }
  RaceControlState getRaceControl() const;

  bool submitCommand(const std::string &entryId, const std::string &command);
  bool debugRaceControl(const DebugRaceControlRequest &req,
                        std::string *errorOut = nullptr);
  void applyCarConditions(const std::string &conditionsPath);
  const TeamConfig &teamConfig() const { return teamConfig_; }

  SimCheckpointV1 captureCheckpoint() const;
  bool restoreCheckpoint(const SimCheckpointV1 &checkpoint,
                         std::string *errorOut = nullptr);

private:
  RaceSession session_;
  TeamConfig teamConfig_;
  std::string raceConfigPath_;
  std::string trackConfigPath_;
  std::string classRulesPath_;
  std::vector<SimEvent> pendingEvents_;
  bool raceCompleteEmitted_ = false;

  struct PendingCommand {
    std::string entryId;
    std::string command;
  };
  std::vector<PendingCommand> pendingCommands_;

  std::string weatherProfileId_ = "changeable";
  double initialTrackWetness_ = 0.0;
  double initialAmbientTempC_ = 0.0;
  unsigned int rngSeed_ = 20260306;
  WeatherProfile weatherProfile_;
  std::string weatherLabel_;
  std::string weatherBiome_;

  void initWeatherOnSession(RaceSession &session, const RaceConfig &config);
  void resetWeatherState();
  void processCommands();
  void loadTeamConfig(const std::string &staffConfigPath = "");

  friend SimCheckpointV1 CaptureCheckpoint(const SimBridge &bridge);
  friend bool RestoreCheckpoint(SimBridge &bridge,
                               const SimCheckpointV1 &checkpoint,
                               std::string *errorOut);
};

extern std::vector<SimEvent> *g_raceEventOut;
void SetRaceEventOut(std::vector<SimEvent> *events);

#endif
