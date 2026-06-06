#ifndef TRAFFIC_HPP
#define TRAFFIC_HPP

#include "car_entity.hpp"

struct TrafficModifiers {
  double speedScale = 1.0;
  bool blueFlag = false;
  bool blocked = false;
  double passDifficulty = 1.0;
};

bool IsPrototypeClass(const std::string &classId);
bool IsGtClass(const std::string &classId);

TrafficModifiers ComputeTrafficModifiers(const Car &self,
                                         const CarInteractionContext &ctx);

#endif
