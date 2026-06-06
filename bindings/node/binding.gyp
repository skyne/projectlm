{
  "targets": [
    {
      "target_name": "projectlm_native",
      "sources": [
        "addon.cpp",
        "../../src/core/car_parts.cpp",
        "../../src/core/cooling_layout.cpp",
        "../../src/core/powertrain_traits.cpp",
        "../../src/core/simulation.cpp",
        "../../src/core/track.cpp",
        "../../src/core/track_sampler.cpp",
        "../../src/core/telemetry.cpp",
        "../../src/core/weather.cpp",
        "../../src/sim/car_entity.cpp",
        "../../src/sim/race.cpp",
        "../../src/sim/sim_bridge.cpp",
        "../../src/sim/driver.cpp",
        "../../src/sim/commands.cpp",
        "../../src/sim/pit_stop.cpp",
        "../../src/sim/traffic.cpp",
        "../../src/config/config_loader.cpp",
        "../../src/config/race_config.cpp",
        "../../src/config/class_rules.cpp",
        "../../src/config/part_compatibility.cpp",
        "../../src/config/team_config.cpp",
        "../../src/config/driver_catalog.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "../../src/core",
        "../../src/sim",
        "../../src/config"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags_cc": [
        "-std=c++20"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "11.0"
            }
          }
        ]
      ]
    }
  ]
}
