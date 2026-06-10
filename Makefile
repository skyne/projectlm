# ProjectLM build (local Makefile — gitignored by default)

CXX ?= clang++
CXXFLAGS = -std=c++20 -Wall -Wextra -O2 \
  -Isrc/core -Isrc/sim -Isrc/config -Isrc/app \
  -Ithird_party/catch2

CORE_SRCS = \
  src/core/car_parts.cpp \
  src/core/cooling_layout.cpp \
  src/core/powertrain_traits.cpp \
  src/core/part_damage.cpp \
  src/core/car_condition_io.cpp \
  src/core/simulation.cpp \
  src/core/weather.cpp \
  src/core/track.cpp \
  src/core/track_corridor.cpp \
  src/core/track_sampler.cpp \
  src/core/path_dynamics.cpp \
  src/core/telemetry.cpp

SIM_SRCS = \
  src/sim/car_entity.cpp \
  src/sim/path_controller.cpp \
  src/sim/race.cpp \
  src/sim/race_control.cpp \
  src/sim/race_control_common.cpp \
  src/sim/sim_bridge.cpp \
  src/sim/driver.cpp \
  src/sim/commands.cpp \
  src/sim/pit_stop.cpp \
  src/sim/traffic.cpp

CONFIG_SRCS = \
  src/config/config_loader.cpp \
  src/config/part_catalog.cpp \
  src/config/race_config.cpp \
  src/config/class_rules.cpp \
  src/config/part_compatibility.cpp \
  src/config/team_config.cpp \
  src/config/driver_catalog.cpp

LIB_SRCS = $(CORE_SRCS) $(SIM_SRCS) $(CONFIG_SRCS)

TEST_SRCS = \
  tests/unit/test_track.cpp \
  tests/unit/test_track_corridor.cpp \
  tests/unit/test_track_sampler.cpp \
  tests/unit/test_path_dynamics.cpp \
  tests/unit/test_simulation.cpp \
  tests/unit/test_part_damage.cpp \
  tests/unit/test_car_parts.cpp \
  tests/unit/test_exhaust_diffuser.cpp \
  tests/unit/test_fuel_cell.cpp \
  tests/unit/test_part_compatibility.cpp \
  tests/unit/test_sim_bridge.cpp \
  tests/unit/test_pit_stop.cpp \
  tests/unit/test_weather.cpp \
  tests/unit/test_track_obstruction.cpp \
  tests/unit/test_race_control.cpp \
  tests/unit/test_race_control_penalties.cpp \
  tests/unit/test_race_control_collisions.cpp \
  tests/unit/test_traffic_pit_rejoin.cpp \
  tests/unit/test_traffic_2d.cpp \
  tests/unit/test_simulation_frenet.cpp \
  tests/unit/test_race_control_escalation.cpp \
  tests/integration/test_lap_golden.cpp \
  tests/integration/test_multicar.cpp \
  tests/integration/test_entry_id_column.cpp

BUILD_DIR = build
BIN_DIR = $(BUILD_DIR)/bin
OBJ_DIR = $(BUILD_DIR)/obj

APP_OBJS = $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(LIB_SRCS) src/app/main.cpp)
TEST_OBJS = $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(LIB_SRCS) $(TEST_SRCS) tests/test_main.cpp)
CATCH_OBJ = $(OBJ_DIR)/third_party/catch2/catch_amalgamated.o

.PHONY: all test run native clean

all: $(BIN_DIR)/projectlm $(BIN_DIR)/projectlm_tests

$(BIN_DIR)/projectlm: $(APP_OBJS) | $(BIN_DIR)
	$(CXX) $(CXXFLAGS) -o $@ $(APP_OBJS)

$(BIN_DIR)/projectlm_tests: $(TEST_OBJS) $(CATCH_OBJ) | $(BIN_DIR)
	$(CXX) $(CXXFLAGS) -o $@ $(TEST_OBJS) $(CATCH_OBJ)

$(OBJ_DIR)/%.o: %.cpp | $(OBJ_DIR)
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(CATCH_OBJ): third_party/catch2/catch_amalgamated.cpp | $(OBJ_DIR)
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(BIN_DIR) $(OBJ_DIR):
	mkdir -p $@

test: $(BIN_DIR)/projectlm_tests
	cd $(CURDIR) && $(BIN_DIR)/projectlm_tests

run: $(BIN_DIR)/projectlm
	$(BIN_DIR)/projectlm $(RUN_ARGS)

native:
	cd bindings/node && npm install --ignore-scripts && rm -rf build && npm run build

native-clean:
	cd bindings/node && rm -rf build && npm run build

clean:
	rm -rf $(BUILD_DIR)
