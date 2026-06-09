#!/usr/bin/env node
/**
 * Live verification: raceControl on ticks, forecast scheduling, rain delivery,
 * and forecast[] alignment with sim state.
 */
import { SessionPlayer } from "./client.js";
import { buildCreateTeamPayload } from "./team_presets.js";

import { defaultWsUrl } from "./ws_url.js";

const WS_URL = defaultWsUrl();
const WATCH_WALL_SEC = Number(process.env.WATCH_SEC ?? 90);
const TIME_SCALE = Number(process.env.TIME_SCALE ?? 40);

interface WeatherCheck {
  name: string;
  ok: boolean;
  detail: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const checks: WeatherCheck[] = [];
  const player = new SessionPlayer();

  try {
    await player.connect({ url: WS_URL, timeoutMs: 8000 });
    await player.waitForCatalog(8000);

    if (player.state.metaState?.setupComplete) {
      player.send("new_game", {});
      await player.waitForMetaUpdate(10000);
    }

    const catalog = player.state.gameCatalog!;
    const payload = buildCreateTeamPayload(catalog, "lmp2-privateer", {
      teamName: "Weather QA",
    });
    player.send("create_team", payload);
    await player.waitForSetupComplete(10000);

    const teamName = player.state.metaState!.teamName;
    const sessionBefore = JSON.stringify(player.state.sessionInit);
    const eventsBefore = player.state.events.length;

    player.send("start_round", {});
    await sleep(400);
    const session = await player.waitForRoundStart(teamName, 12000, sessionBefore);

    checks.push({
      name: "session_started",
      ok: Boolean(session.targetDurationSeconds && session.targetDurationSeconds > 0),
      detail: `format=${session.raceFormat} duration=${session.targetDurationSeconds}s track=${session.trackName}`,
    });

    player.send("set_time_scale", { timeScale: TIME_SCALE });
    player.send("resume", {});
    await sleep(300);

    const tickSamples: Array<{
      raceTime: number;
      rc: NonNullable<ReturnType<SessionPlayer["raceControl"]>>;
    }> = [];

    const start = Date.now();
    let lastRaceTime = -1;
    while (Date.now() - start < WATCH_WALL_SEC * 1000) {
      const tick = player.state.latestTick;
      if (tick?.raceControl && tick.raceTime !== lastRaceTime) {
        lastRaceTime = tick.raceTime;
        tickSamples.push({ raceTime: tick.raceTime, rc: tick.raceControl });
      }
      await sleep(100);
    }

    const hasRaceControl = tickSamples.length > 0;
    checks.push({
      name: "race_control_on_ticks",
      ok: hasRaceControl,
      detail: hasRaceControl
        ? `${tickSamples.length} ticks with raceControl`
        : "No raceControl on any tick",
    });

    const withForecast = tickSamples.filter((t) => (t.rc.forecast?.length ?? 0) > 0);
    checks.push({
      name: "forecast_array_present",
      ok: withForecast.length > 0,
      detail: withForecast.length
        ? `forecast steps=${withForecast[0]!.rc.forecast.length} sample+10=${withForecast[0]!.rc.forecast[1]?.phase ?? "n/a"}`
        : "forecast[] missing or empty",
    });

    const newEvents = player.state.events.slice(eventsBefore);
    const weatherEvents = newEvents.filter((e) =>
      e.message.toLowerCase().includes("weather:"),
    );
    const forecastEvent = weatherEvents.find((e) =>
      e.message.includes("rain forecast in"),
    );
    const rainEvent = weatherEvents.find((e) =>
      e.message.includes("light rain begins") || e.message.includes("heavy rain"),
    );

    checks.push({
      name: "forecast_event_logged",
      ok: Boolean(forecastEvent),
      detail: forecastEvent?.message ?? `no forecast event in ${newEvents.length} events`,
    });

    checks.push({
      name: "rain_event_logged",
      ok: Boolean(rainEvent),
      detail: rainEvent?.message ?? "no rain start event yet (may need longer watch)",
    });

    const scheduledSample = tickSamples.find((t) => t.rc.forecastRainInSeconds > 0);
    if (scheduledSample) {
      const mins = Math.ceil(scheduledSample.rc.forecastRainInSeconds / 60);
      const stepIdx = Math.min(
        scheduledSample.rc.forecast.length - 1,
        Math.max(1, Math.round(mins / 10)),
      );
      const step = scheduledSample.rc.forecast[stepIdx];
      const rainy =
        step?.phase === "LightRain" ||
        step?.phase === "HeavyRain" ||
        (step?.rainIntensity ?? 0) >= 0.15;
      checks.push({
        name: "forecast_aligns_with_countdown",
        ok: rainy,
        detail: `countdown=${Math.round(scheduledSample.rc.forecastRainInSeconds)}s step+${step?.offsetMinutes}m=${step?.phase ?? "n/a"}`,
      });
    } else {
      checks.push({
        name: "forecast_aligns_with_countdown",
        ok: false,
        detail: "No scheduled countdown observed during watch window",
      });
    }

    const afterRain = tickSamples.filter(
      (t) =>
        t.rc.weatherPhase === "LightRain" ||
        t.rc.weatherPhase === "HeavyRain" ||
        t.rc.trackWetness > 0.08,
    );
    checks.push({
      name: "rain_delivered_in_sim",
      ok: afterRain.length > 0,
      detail: afterRain.length
        ? `wet=${afterRain[afterRain.length - 1]!.rc.trackWetness.toFixed(3)} phase=${afterRain[afterRain.length - 1]!.rc.weatherPhase} @${afterRain[afterRain.length - 1]!.raceTime.toFixed(0)}s`
        : `max wetness=${Math.max(...tickSamples.map((t) => t.rc.trackWetness), 0).toFixed(3)}`,
    });

    if (forecastEvent && rainEvent) {
      checks.push({
        name: "rain_after_forecast",
        ok: rainEvent.timestamp >= forecastEvent.timestamp,
        detail: `forecast@${forecastEvent.timestamp.toFixed(0)}s rain@${rainEvent.timestamp.toFixed(0)}s`,
      });
    }

    const ok = checks.every((c) => c.ok);
    console.log(
      JSON.stringify(
        {
          ok,
          watchWallSec: WATCH_WALL_SEC,
          timeScale: TIME_SCALE,
          simTimeReached: tickSamples.at(-1)?.raceTime ?? 0,
          checks,
          weatherEvents: weatherEvents.map((e) => ({
            t: e.timestamp,
            msg: e.message,
          })),
          errors: player.state.errors,
        },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  } finally {
    player.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
});
