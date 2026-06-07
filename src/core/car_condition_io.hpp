#ifndef CAR_CONDITION_IO_HPP
#define CAR_CONDITION_IO_HPP

#include "part_damage.hpp"
#include <string>
#include <unordered_map>

struct SimulationState;
struct CarConfig;

bool LoadCarConditionsFile(const std::string &path,
                           std::unordered_map<std::string, std::string> &outByEntry);

void ApplyCarConditionLine(SimulationState &state, const CarConfig &car,
                           const std::string &line);

#endif
