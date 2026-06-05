#ifndef CONFIG_LOADER_HPP
#define CONFIG_LOADER_HPP

#include "car_parts.hpp"
#include "simulation.hpp"
#include <string>

bool LoadCarConfig(const std::string &filename, CarConfig &car);
bool LoadPhysicsConfig(const std::string &filename, PhysicsConfig &physics);
bool LoadAssemblyConfig(const std::string &filename, AssemblyConfig &assembly);
bool LoadPartCatalog(const std::string &filename, PartCatalog &catalog);

#endif
