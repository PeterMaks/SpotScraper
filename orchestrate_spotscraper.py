#!/usr/bin/env python3
# Antigravity Multi-Agent Orchestrator for SpotScraper (Gemini 3.8 Flash)
# Supports both the local Antigravity SDK (google.antigravity) and
# Gemini Managed Agents via the Interactions API (google-genai).

import asyncio
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import List

MODEL_ID = "gemini-3.8-flash"
MANAGED_AGENT_ID = "antigravity-preview-09-2026"


@dataclass
class SubagentSpec:
    name: str
    thinking_level: str  # "low" | "medium" | "high" (minimal is unsupported on 3.8 Flash)
    target_files: List[str]
    instructions: str


SUBAGENTS: List[SubagentSpec] = [
    SubagentSpec(
        name="python_scraper_fixer",
        thinking_level="medium",
        target_files=["Scraper.py", "requirements.txt"],
        instructions=(
            "Fix Scraper.py: "
            "1) Open CSVs with encoding='utf-8-sig' and initialize `reader = csv.reader(f)` after `f.seek(0)` in the headerless CSV branch (line 266). "
            "2) Emit `Downloading [dl_idx/total_items]` and `🔍 Active Track: {item}` from `download_resolved`, and change producer skip logs to `[Lookahead Skip]`. "
            "3) Use `shutil.which('ffmpeg') or imageio_ffmpeg.get_ffmpeg_exe()` before the Windows path fallback. "
            "4) Change outtmpl to `%(artist)s - %(title)s.%(ext)s` and include `.opus`/`.webm` in `build_dir_cache`. "
            "5) Use `os.environ.get('BACKEND_URL', 'http://localhost:3001')` in `emit_log` and fall back to writing `download_links.json` locally on connection error."
        ),
    ),
    SubagentSpec(
        name="backend_security_csv_fixer",
        thinking_level="high",
        target_files=[
            "dashboard/backend/server.js",
            "dashboard/backend/parser.js",
            "dashboard/backend/apple_parser.js",
        ],
        instructions=(
            "Fix Express backend and CSV parsers: "
            "1) In `server.js`, enforce `resolvedPath !== resolvedDownloadsDir && resolvedPath.startsWith(resolvedDownloadsDir + path.sep)` in DELETE, delete-batch, and zip routes. "
            "2) Add `tauri://localhost`, `http://tauri.localhost`, and `https://tauri.localhost` to `allowedOrigins` and CSP `connect-src`. "
            "3) Replace `parseCSV` in `server.js` and `parseCSVLine` in `parser.js` with a full RFC 4180 state-machine parser that strips `\\uFEFF` BOM, preserves multiline quoted fields (`Thinking About You (feat.\\n\\nAyah Marar)`), and keeps comma-separated quoted `Genres` intact. "
            "4) In `parser.js`, wrap `JSON.parse` in `try/catch`, skip `Playlist*.json`, and aggregate tracks/artists/albums/genres/trends directly from `.csv` and `.xlsx` files when streaming history JSONs do not cover those tracks. "
            "5) Replace `path.basename(filePath, '.mp3')` with `path.parse(filePath).name` and scan all `.json` files in `apple_music_data/jsons/`."
        ),
    ),
    SubagentSpec(
        name="tauri_frontend_csv_fixer",
        thinking_level="high",
        target_files=[
            "dashboard/frontend/src/AppContext.jsx",
            "dashboard/frontend/src/pages/Dashboard.jsx",
            "dashboard/frontend/src/pages/ScraperControl.jsx",
            "dashboard/frontend/src/pages/Downloads.jsx",
            "dashboard/frontend/src/components/Layout.jsx",
        ],
        instructions=(
            "Fix Tauri and React frontend: "
            "1) In `AppContext.jsx`, detect `window.__TAURI_INTERNALS__ || window.__TAURI__` so Tauri production builds use `http://127.0.0.1:3001` (or `VITE_BACKEND_URL`) instead of `''`. "
            "2) In `handleFileUpload`, read files via `file.arrayBuffer()` to Base64 (or Tauri `invoke('import_spotify_csv')`), call both `fetchStats()` and `fetchSources()`, and reset `event.target.value = ''`. "
            "3) In `Dashboard.jsx`, set `accept='.json,.csv,.xlsx,.xls'`, deduplicate `uniqueArtists` and `uniqueTracks` in `mergeStats`, compute `avgDailyHours` from `totalHours / dailyTrend.length`, and check `totalHours > 0 || totalPlays > 0` before rendering stats cards. "
            "4) In `ScraperControl.jsx`, match `/(?:Processing|Downloading) \\[(\\d+)\\/(\\d+)\\]/` and ignore `[Lookahead Skip]` lines for `hasError`. "
            "5) Strip `.mp3`, `.m4a`, `.opus`, and `.webm` when formatting track names in `Downloads.jsx` and `Layout.jsx`."
        ),
    ),
    SubagentSpec(
        name="devops_ci_docker_fixer",
        thinking_level="low",
        target_files=[
            "dashboard/backend/docker-entrypoint.sh",
            "docker-compose.yml",
            "dashboard/frontend/nginx.conf",
            ".github/workflows/ci-cd.yml",
        ],
        instructions=(
            "Fix Docker and CI/CD configs: "
            "1) In `docker-entrypoint.sh`, initialize JSON files and directories under `/app/` instead of `/`. "
            "2) In `docker-compose.yml`, pass `BACKEND_URL=http://backend:3001` to `scraper`, share state files via volume, and map frontend port `8080:80`. "
            "3) In `nginx.conf`, include `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` inside the static assets `location` block. "
            "4) In `.github/workflows/ci-cd.yml`, add `test` branch triggers, remove `--ext .js,.jsx` for ESLint v10, and remove `--exit-zero` / `|| true` masking."
        ),
    ),
]


def run_verification_suite() -> str:
    # Runs syntax, self-check, CSV parser, and frontend build checks
    py_exe = sys.executable
    cmds = [
        [py_exe, "-m", "py_compile", "Scraper.py", "spotify_recap.py"],
        [py_exe, "Scraper.py", "--selfcheck"],
        ["node", "--check", "dashboard/backend/server.js"],
        ["node", "--check", "dashboard/backend/parser.js"],
        ["node", "--check", "dashboard/backend/apple_parser.js"],
    ]
    outputs = []
    for cmd in cmds:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        outputs.append(f"$ {' '.join(cmd)} -> exit {proc.returncode}\n{proc.stdout}{proc.stderr}")
    return "\n".join(outputs)


async def run_with_antigravity_sdk() -> None:
    # Executes parallel static custom subagents via the Antigravity SDK
    from google.antigravity import Agent, LocalAgentConfig, types

    subagent_configs = [
        types.SubagentConfig(
            name=spec.name,
            description=f"Worker subagent for {', '.join(spec.target_files)}",
            system_instructions=spec.instructions,
            tools=[run_verification_suite],
        )
        for spec in SUBAGENTS
    ]

    config = LocalAgentConfig(
        model=MODEL_ID,
        capabilities=types.CapabilitiesConfig(enable_subagents=True),
        tools=[run_verification_suite],
        subagents=subagent_configs,
    )

    async with Agent(config) as orchestrator:
        response = await orchestrator.chat(
            "Execute all 4 SpotScraper remediation subagents in parallel worktrees, "
            "reconcile their changes, and run `run_verification_suite` to verify."
        )
        print(await response.text())


def run_with_genai_interactions_api() -> None:
    # Executes the multi-stage workflow via the Google GenAI Interactions API (gemini-3.8-flash)
    from google import genai

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    # Stage 1: Coordinator Plan (High thinking effort)
    plan_interaction = client.interactions.create(
        model=MODEL_ID,
        input=(
            "You are the SpotScraper Lead Orchestrator. Generate a deterministic patch plan "
            "for the 4 worker subagents covering the test branch defects and Tauri Spotify CSV import."
        ),
        generation_config={"thinking_level": "high"},
    )
    print(f"[Stage 1] Plan generated (ID: {plan_interaction.id})")

    # Stage 2: Execute Subagent Tasks Chained via previous_interaction_id
    last_id = plan_interaction.id
    for spec in SUBAGENTS:
        worker_interaction = client.interactions.create(
            model=MODEL_ID,
            previous_interaction_id=last_id,
            input=(
                f"Subagent: {spec.name}\n"
                f"Target files: {', '.join(spec.target_files)}\n"
                f"Instructions: {spec.instructions}"
            ),
            generation_config={"thinking_level": spec.thinking_level},
        )
        last_id = worker_interaction.id
        print(f"[Stage 2] Completed {spec.name} (thinking_level={spec.thinking_level}, ID={last_id})")

    # Stage 3: Managed Antigravity Agent Verification Gate
    verify_interaction = client.interactions.create(
        agent=MANAGED_AGENT_ID,
        previous_interaction_id=last_id,
        input=(
            "Verify all modified files against the Exportify 24-column CSV test cases "
            "(UTF-8 BOM, multiline Track Name quotes, comma-separated Genres, semicolon Artists), "
            "confirm CWE-22 path traversal rejection, and run ESLint v10 + Vite build."
        ),
        environment="local",
    )
    print(f"[Stage 3] Verification Report:\n{verify_interaction.output_text}")


if __name__ == "__main__":
    try:
        import google.antigravity  # noqa: F401
        asyncio.run(run_with_antigravity_sdk())
    except ImportError:
        if "GEMINI_API_KEY" in os.environ:
            run_with_genai_interactions_api()
        else:
            print("Local verification suite output:")
            print(run_verification_suite())
