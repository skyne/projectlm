# Driver gender & sponsor appeal — design

> **Status:** Gender field + UI shipped; sponsor appeal math implemented in `server/src/game/sponsor_appeal.ts` (not yet wired into race finance breakdown UI).

## Goals

1. Represent **gender** on drivers (and eventually staff) for roster identity and marketing mechanics.
2. Reward diverse, authentic programmes without making gender a raw pace stat.
3. Tie bonuses to **sponsor enthusiasm** (income multipliers), not lap time.

## Data model

| Field | Type | Notes |
|-------|------|--------|
| `DriverProfilePayload.gender` | `"female" \| "male"` optional | Player-editable in Driver Center; market/catalog can set explicitly later |
| `StaffMemberPayload.gender` | `"female" \| "male"` optional | HQ hiring UI — future pass |

Missing gender = **no bonus** (neutral), not assumed male.

## Sponsor appeal formula (per car entry)

Implemented in `computeCarSponsorAppeal()`:

| Trigger | Bonus | Rationale |
|---------|-------|-----------|
| Each **female** driver on the car | **+3%** each | Individual marketability / fan engagement |
| **All-female driver lineup** (≥2 drivers, all female) | **+8%** | Programme story for lifestyle / equality-focused sponsors |
| **All-female key crew** on that car (engineer + strategist + mechanic) | **+5%** | Authentic alignment — “built by women, raced by women” |

- Bonuses **stack additively** on the multiplier: `1 + sum(bonuses)`.
- **Cap:** `1.20×` (+20% total) — `MAX_SPONSOR_APPEAL_MULTIPLIER`.
- Applies to **per-race sponsor stipends and performance bonuses** for that entry, not prize money.

### Example

Car #1 runs two female drivers (+6%) and all-female eng/strategy/mechanics (+5%) → **+11%** sponsor income (`×1.11`).

All-female lineup with two female drivers: +6% individual + +8% lineup = **+14%** before staff.

## UI (shipped)

- **Flags:** ISO nationality codes render as 🇬🇧-style emoji in roster, chips, hero, and market cards (`viewer/src/utils/countryFlag.ts`).
- **Gender:** Selector in Driver Center hero; badge on roster rows.
- **Unspent points:** Hero shows “**N pts to assign**”; stat rows with affordable +1 bumps get gold highlight.

## Integration roadmap

1. **Race finances** — multiply `perRaceIncome` / bonuses in `computeRaceFinances()` using car’s assigned drivers + staff.
2. **Negotiations** — fan-facing sponsors (`velocity`, `aurora_energy`) get **1.5×** appeal sensitivity; technical partners (`titan_lube`, `griddata`) get **0.5×**.
3. **HQ readout** — “Sponsor appeal ×1.11” on car card when bonuses active.
4. **WEC catalog** — optional `gender` column in `lemans2026_drivers.txt` (append field, migration script).
5. **Staff hiring** — gender field + same staff-alignment check.

## Non-goals

- Gender does **not** modify `dryPace`, stamina, or any on-track stat.
- No penalty for male-only lineups — bonuses are additive opportunities, not maluses.

## Balance knobs

Constants in `sponsor_appeal.ts`:

- `FEMALE_DRIVER_INDIVIDUAL_BONUS`
- `ALL_FEMALE_LINEUP_BONUS`
- `ALL_FEMALE_STAFF_BONUS`
- `MAX_SPONSOR_APPEAL_MULTIPLIER`

Tune after playtesting sponsor income vs prize money share.
