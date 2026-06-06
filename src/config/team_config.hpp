#ifndef TEAM_CONFIG_HPP
#define TEAM_CONFIG_HPP

#include "pit_stop.hpp"
#include <map>
#include <string>
#include <vector>

struct StaffMember {
  std::string role;
  std::string name;
  double skill = 75.0;
};

struct CalendarEvent {
  int round = 0;
  std::string trackId;
  std::string format;
  bool completed = false;
  int championshipPoints = 0;
};

struct TeamConfig {
  std::string teamName = "ProjectLM Racing";
  double budget = 5000000.0;
  int rdPoints = 100;
  std::string playerEntryId = "entry-1";
  std::vector<StaffMember> staff;
  std::vector<std::string> unlockedParts;
  std::vector<CalendarEvent> calendar;
  int seasonYear = 2026;
  int currentRound = 1;

  StaffModifiers staffModifiers() const;
};

bool LoadTeamConfig(const std::string &path, TeamConfig &out);

#endif
