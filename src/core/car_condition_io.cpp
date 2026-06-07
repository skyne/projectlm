#include "car_condition_io.hpp"
#include "simulation.hpp"
#include <fstream>
#include <sstream>

namespace {
std::string Trim(const std::string &s) {
  size_t a = s.find_first_not_of(" \t\r\n");
  if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n");
  return s.substr(a, b - a + 1);
}
} // namespace

bool LoadCarConditionsFile(const std::string &path,
                           std::unordered_map<std::string, std::string> &outByEntry) {
  outByEntry.clear();
  std::ifstream in(path);
  if (!in.is_open())
    return false;
  std::string line;
  while (std::getline(in, line)) {
    line = Trim(line);
    if (line.empty() || line[0] == '#')
      continue;
    if (line.rfind("condition=", 0) != 0)
      continue;
    const std::string payload = line.substr(10);
    const auto bar = payload.find('|');
    if (bar == std::string::npos)
      continue;
    const std::string entryId = Trim(payload.substr(0, bar));
    const std::string rest = payload.substr(bar + 1);
    if (!entryId.empty())
      outByEntry[entryId] = rest;
  }
  return true;
}

void ApplyCarConditionLine(SimulationState &state, const CarConfig &car,
                           const std::string &payload) {
  InitPartDamageState(state.partDamage);
  std::istringstream parts(payload);
  std::string token;
  std::vector<std::string> irreparable;
  while (std::getline(parts, token, '|')) {
    token = Trim(token);
    if (token.empty())
      continue;
    const auto eq = token.find('=');
    if (eq == std::string::npos)
      continue;
    const std::string key = Trim(token.substr(0, eq));
    const std::string val = Trim(token.substr(eq + 1));
    if (key == "irreparable") {
      std::istringstream ir(val);
      std::string part;
      while (std::getline(ir, part, ',')) {
        part = Trim(part);
        if (!part.empty())
          irreparable.push_back(part);
      }
      continue;
    }
    if (key == "fault") {
      std::istringstream fr(val);
      std::string id;
      std::string kindTok;
      std::string linkedTok;
      std::string sevTok;
      std::string revTok;
      if (!std::getline(fr, id, '|') || !std::getline(fr, kindTok, '|') ||
          !std::getline(fr, linkedTok, '|') || !std::getline(fr, sevTok, '|') ||
          !std::getline(fr, revTok, '|'))
        continue;
      HiddenFault fault;
      fault.kind = HiddenFaultKindFromToken(Trim(kindTok));
      fault.linkedPart = DamagePartFromToken(Trim(linkedTok));
      fault.severity = std::max(0.0, std::min(100.0, std::stod(Trim(sevTok))));
      fault.revealed = Trim(revTok) == "1";
      state.partDamage.hiddenFaults.push_back(fault);
      continue;
    }
    const DamagePart part = DamagePartFromToken(key);
    if (part == DamagePart::Count)
      continue;
    const double health = std::max(0.0, std::min(100.0, std::stod(val)));
    state.partDamage.health[DamagePartIndex(part)] = health;
  }
  for (const std::string &tok : irreparable) {
    const DamagePart part = DamagePartFromToken(tok);
    if (part == DamagePart::Count)
      continue;
    state.partDamage.irreparable[DamagePartIndex(part)] = true;
  }
  SyncDerivedEngineHealth(state, car);
}
