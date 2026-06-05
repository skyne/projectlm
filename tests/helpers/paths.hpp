#ifndef TEST_PATHS_HPP
#define TEST_PATHS_HPP

#include <cstdlib>
#include <filesystem>
#include <string>

inline std::string ProjectRoot() {
  if (const char *env = std::getenv("PROJECTLM_ROOT"))
    return env;
  return std::filesystem::current_path().string();
}

inline std::string ConfigPath(const std::string &name) {
  return (std::filesystem::path(ProjectRoot()) / "configs" / name).string();
}

inline std::string TrackPath(const std::string &name) {
  return (std::filesystem::path(ProjectRoot()) / "tracks" / name).string();
}

#endif
