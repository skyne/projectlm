#include "team_config.hpp"
#include <fstream>
#include <iostream>
#include <sstream>

namespace {

std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

std::vector<std::string> SplitCsv(const std::string &value) {
  std::vector<std::string> out;
  std::istringstream is(value);
  std::string token;
  while (std::getline(is, token, ',')) {
    token = Trim(token);
    if (!token.empty())
      out.push_back(token);
  }
  return out;
}

} // namespace

StaffModifiers TeamConfig::staffModifiers() const {
  StaffModifiers mods;
  for (const StaffMember &member : staff) {
    if (member.role == "engineer")
      mods.engineerSkill = std::max(mods.engineerSkill, member.skill);
    else if (member.role == "mechanic")
      mods.mechanicSkill = std::max(mods.mechanicSkill, member.skill);
    else if (member.role == "strategist")
      mods.strategistSkill = std::max(mods.strategistSkill, member.skill);
  }
  return mods;
}

bool LoadTeamConfig(const std::string &path, TeamConfig &out) {
  std::ifstream file(path);
  if (!file.is_open())
    return false;

  out = TeamConfig{};
  std::string line;
  while (std::getline(file, line)) {
    line = Trim(line);
    if (line.empty() || line[0] == '#')
      continue;

    const size_t eq = line.find('=');
    if (eq == std::string::npos)
      continue;

    const std::string key = Trim(line.substr(0, eq));
    const std::string value = Trim(line.substr(eq + 1));

    if (key == "team_name")
      out.teamName = value;
    else if (key == "budget")
      out.budget = std::stod(value);
    else if (key == "rd_points")
      out.rdPoints = std::stoi(value);
    else if (key == "player_entry")
      out.playerEntryId = value;
    else if (key == "season_year")
      out.seasonYear = std::stoi(value);
    else if (key == "current_round")
      out.currentRound = std::stoi(value);
    else if (key == "unlocked_parts")
      out.unlockedParts = SplitCsv(value);
    else if (key == "staff") {
      const auto fields = SplitCsv(value);
      if (fields.size() >= 3) {
        StaffMember member;
        member.role = fields[0];
        member.name = fields[1];
        member.skill = std::stod(fields[2]);
        out.staff.push_back(std::move(member));
      }
    } else if (key == "calendar") {
      const auto fields = SplitCsv(value);
      if (fields.size() >= 3) {
        CalendarEvent event;
        event.round = std::stoi(fields[0]);
        event.trackId = fields[1];
        event.format = fields[2];
        if (fields.size() >= 4)
          event.completed = fields[3] == "true" || fields[3] == "1";
        out.calendar.push_back(std::move(event));
      }
    }
  }

  return true;
}
