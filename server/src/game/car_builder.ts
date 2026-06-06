import * as fs from "fs";
import * as path from "path";
import type { CarSessionSetup } from "./car_setup";

export interface EngineBuildPayload {
  engine_layout: string;
  fuel_type: string;
  cylinders: number;
  bore: number;
  stroke: number;
  max_rpm: number;
  peak_torque_nm?: number;
  peak_torque_rpm?: number;
  base_vibration: number;
  aspiration?: string;
  drivetrain?: string;
}

export interface CarBuildPayload {
  carName: string;
  chassis_type: string;
  front_aero_type: string;
  rear_aero_type: string;
  cooling_pack: string;
  wheel_package?: string;
  suspension_layout?: string;
  front_suspension_layout?: string;
  rear_suspension_layout?: string;
  front_wheel_diameter_in?: number;
  rear_wheel_diameter_in?: number;
  front_tire_width_mm?: number;
  rear_tire_width_mm?: number;
  fuel_system: string;
  brake_system: string;
  transmission: string;
  hybrid_system: string;
  engine: EngineBuildPayload;
  cooling?: {
    engine_radiator: number;
    oil_cooler: number;
    charge_air_cooler: number;
    gearbox_cooler: number;
  };
}

export function writeFleetCarConfig(
  outputPath: string,
  build: CarBuildPayload,
  setup: CarSessionSetup,
  tireCompound: string,
): void {
  const lines: string[] = [
    `# Generated fleet config`,
    `car_name=${build.carName}`,
    `engine_layout=${build.engine.engine_layout}`,
    `fuel_type=${build.engine.fuel_type}`,
    `cylinders=${build.engine.cylinders}`,
    `bore=${build.engine.bore}`,
    `stroke=${build.engine.stroke}`,
    `max_rpm=${build.engine.max_rpm}`,
  ];

  if (build.engine.peak_torque_nm != null)
    lines.push(`peak_torque_nm=${build.engine.peak_torque_nm}`);
  if (build.engine.peak_torque_rpm != null)
    lines.push(`peak_torque_rpm=${build.engine.peak_torque_rpm}`);
  lines.push(`base_vibration=${build.engine.base_vibration}`);
  if (build.engine.aspiration) lines.push(`aspiration=${build.engine.aspiration}`);
  if (build.engine.drivetrain) lines.push(`drivetrain=${build.engine.drivetrain}`);

  lines.push(
    `chassis_type=${build.chassis_type}`,
    `front_aero_type=${build.front_aero_type}`,
    `rear_aero_type=${build.rear_aero_type}`,
    `cooling_pack=${build.cooling_pack}`,
  );

  if (build.cooling) {
    lines.push(
      `engine_radiator_size=${build.cooling.engine_radiator}`,
      `oil_cooler_size=${build.cooling.oil_cooler}`,
      `charge_air_cooler_size=${build.cooling.charge_air_cooler}`,
      `gearbox_cooler_size=${build.cooling.gearbox_cooler}`,
    );
  }

  if (build.wheel_package) lines.push(`wheel_package=${build.wheel_package}`);
  if (build.suspension_layout)
    lines.push(`suspension_layout=${build.suspension_layout}`);
  if (build.front_suspension_layout)
    lines.push(`front_suspension_layout=${build.front_suspension_layout}`);
  if (build.rear_suspension_layout)
    lines.push(`rear_suspension_layout=${build.rear_suspension_layout}`);
  if (build.front_wheel_diameter_in != null)
    lines.push(`front_wheel_diameter_in=${build.front_wheel_diameter_in}`);
  if (build.rear_wheel_diameter_in != null)
    lines.push(`rear_wheel_diameter_in=${build.rear_wheel_diameter_in}`);
  if (build.front_tire_width_mm != null)
    lines.push(`front_tire_width_mm=${build.front_tire_width_mm}`);
  if (build.rear_tire_width_mm != null)
    lines.push(`rear_tire_width_mm=${build.rear_tire_width_mm}`);

  lines.push(
    `starting_tire_compound=${tireCompound}`,
    `fuel_system=${build.fuel_system}`,
    `brake_system=${build.brake_system}`,
    `transmission=${build.transmission}`,
    `hybrid_system=${build.hybrid_system}`,
    `ride_height=${(setup.rideHeightMm / 1000).toFixed(4)}`,
    `front_spring_stiffness=${Math.round(setup.frontSpringStiffness)}`,
    `rear_spring_stiffness=${Math.round(setup.rearSpringStiffness)}`,
    `front_wing_angle=${setup.frontWingAngle.toFixed(3)}`,
    `rear_wing_angle=${setup.rearWingAngle.toFixed(3)}`,
    `front_damper=${setup.frontDamper.toFixed(3)}`,
    `rear_damper=${setup.rearDamper.toFixed(3)}`,
    `engine_radiator_opening=${setup.engineRadiatorOpening.toFixed(3)}`,
    `oil_cooler_opening=${setup.oilCoolerOpening.toFixed(3)}`,
    `charge_air_cooler_opening=${setup.chargeAirCoolerOpening.toFixed(3)}`,
    `gearbox_cooler_opening=${setup.gearboxCoolerOpening.toFixed(3)}`,
    "",
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
}
