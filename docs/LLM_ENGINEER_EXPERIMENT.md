# LLM Race Engineer Experiment

Branch: `experiment/llm-engineer`  
Worktree: `../projectlm-llm-experiment`

This spike adds a **local Ollama-backed race engineer** to the pit wall sidebar. It summarizes live telemetry, returns natural-language advice, and can suggest pit/driver commands the player applies with one click.

## Architecture

```
Viewer (EngineerPanel)
    │ ask_engineer / get_engineer_status
    ▼
Server (EngineerService)
    │ telemetry JSON prompt
    ▼
Ollama (localhost:11434)  — or heuristic fallback if offline
```

New files:

- `server/src/llm/ollama_client.ts` — HTTP client for Ollama chat API
- `server/src/llm/telemetry_summary.ts` — compress `CarSnapshot` for prompts
- `server/src/llm/engineer_service.ts` — prompt + parse + fallback rules
- `viewer/src/components/EngineerPanel.ts` — sidebar UI during live sessions

## Setup

1. Install [Ollama](https://ollama.com) and pull a small model:

```bash
ollama pull qwen2.5:3b
```

2. From this worktree, run server + viewer as usual.

3. Optional env vars:

```bash
export OLLAMA_HOST=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:3b
```

## Try it

### Pit wall (live race)
1. Start a race and open the **Map** or **Timing** view (sidebar visible).
2. In **Race Engineer**, click **Get advice** or ask e.g. “Should we box now?”
3. If the model suggests a command, click **Apply suggested command**.

### Garage (car development)
1. Open **Garage** from Team HQ or the hub.
2. Scroll to **Development Engineer** in the stats column.
3. Click **Analyze build** or ask e.g. “More downforce for Paul Ricard?”
4. **Apply suggested parts** updates the build locally — review bars, then **Save Build**.

### AI stint guide (automatic)
When the race is **resumed**, the server plans stint 1 for every AI car (compound, driver mode, target stint length, fuel window). After each completed pit stop (`pitCount` increases), it plans the next stint. Plans feed into `ai_strategy.ts` for pit timing and tyre compound selection.

Disable LLM stint planning: `AI_STINT_LLM=0` (uses heuristics only).

When Ollama is not running, the server uses a **heuristic fallback** (fuel/tyre/stamina rules similar to `ai_strategy.ts`) so the UI still works.

## Next steps (not implemented here)

- Post-race R&D report from full stint history
- Structured JSON output / tool calling instead of line parsing
- Native sim grid fix in mock session (`placeOnGrid` parity)

## Merge back to main

```bash
cd /Users/daniel_heringei/Sources/projectlm
git merge experiment/llm-engineer
# or cherry-pick specific commits after you commit in the worktree
```

## Worktree cleanup

```bash
git worktree remove ../projectlm-llm-experiment
git branch -D experiment/llm-engineer   # after merge
```
