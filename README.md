# SpotScraper

A self-hosted music analytics dashboard and downloader. Aggregates listening history from **Spotify** and **Apple Music**, displays stats (top artists, tracks, albums, genres, listening trends), and downloads tracks via yt-dlp.

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Running with Docker (Recommended)](#running-with-docker-recommended)
- [Running Locally](#running-locally)
- [Uploading Data](#uploading-data)
- [Project Structure](#project-structure)
- [CI/CD](#cicd)
- [Environment Variables](#environment-variables)

---

## Architecture

| Component | Tech | Port |
|-----------|------|------|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui, Recharts | 5173 (dev) / 8080 (Docker) |
| Backend | Express.js (Node 20), Winston logging | 3001 |
| Scraper | Python 3.12, yt-dlp, openpyxl | - |

---

## Prerequisites

### Docker (recommended)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose v2

### Local development

- **Node.js** >= 20
- **Python** >= 3.12
- **ffmpeg** (required by yt-dlp for audio conversion)

---

## Running with Docker (Recommended)

1. Clone the repository:

```bash
git clone https://github.com/PeterMaks/SpotScraper.git
cd SpotScraper
```

2. Build and start the containers:

```bash
docker compose up -d --build
```

This starts two services:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:3001 |

3. To run the scraper on-demand:

```bash
docker compose run --rm scraper python Scraper.py 10
```

4. View logs:

```bash
docker compose logs -f backend
```

5. Stop everything:

```bash
docker compose down
```

### Docker Volumes

Data is persisted across restarts through named volumes:

| Volume | Mount Path | Contents |
|--------|------------|----------|
| `downloads_data` | `/app/downloads` | Downloaded audio files |
| `spotify_data` | `/app/spotify_data` | Spotify listening history |
| `apple_music_data` | `/app/apple_music_data` | Apple Music CSVs and JSONs |
| `backend_data` | `/app/data` | Backend runtime data |

---

## Running Locally

### 1. Set up the Python scraper

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Install dashboard dependencies

```bash
cd dashboard
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Start the dashboard

From the `dashboard/` directory, run both the backend and frontend concurrently:

```bash
cd dashboard
npm run dev
```

This starts:

| Service | URL |
|---------|-----|
| Frontend (Vite dev server) | http://localhost:5173 |
| Backend (nodemon) | http://localhost:3001 |

You can also start them individually:

```bash
npm run backend   # backend only
npm run frontend  # frontend only
```

### 4. Run the scraper

From the project root (with the virtual environment active):

```bash
python Scraper.py 10
```

The number argument controls how many tracks to process per playlist.

---

## Uploading Data

The dashboard supports uploading listening history data through the UI.

### Spotify

Upload files through the **Spotify Data** card on the Dashboard page. Accepted formats:

- `.json` -- Spotify extended streaming history (from your privacy data request)
- `.csv` -- Exported playlists or track metadata
- `.xlsx` / `.xls` -- Excel spreadsheets with track data

Files are saved to `spotify_data/`.

### Apple Music

Upload files through the **Apple Music Data** card. Accepted formats:

- `.csv` -- Play History Daily Tracks (from Apple privacy data request). Routed to `apple_music_data/csvs/`.
- `.json` -- Apple Music Library Tracks (contains genre and album metadata). Routed to `apple_music_data/jsons/`.

Both file types are required for full Apple Music stats including genre breakdowns.

---

## Project Structure

```
SpotScraper/
|-- Scraper.py                   # Main Python scraper (yt-dlp)
|-- spotify_recap.py             # Spotify Wrapped-style recap generator
|-- requirements.txt             # Python dependencies
|-- Dockerfile                   # Scraper container image
|-- docker-compose.yml           # Multi-service orchestration
|
|-- dashboard/
|   |-- package.json             # Root dashboard scripts (concurrently)
|   |
|   |-- backend/
|   |   |-- server.js            # Express API server
|   |   |-- parser.js            # Spotify data aggregation
|   |   |-- apple_parser.js      # Apple Music data aggregation
|   |   |-- logger.js            # Winston logger config
|   |   |-- Dockerfile           # Backend container image
|   |   +-- docker-entrypoint.sh
|   |
|   +-- frontend/
|       |-- src/
|       |   |-- pages/           # Dashboard, Downloads pages
|       |   |-- components/      # shadcn/ui components, charts
|       |   |-- AppContext.jsx   # Global state provider
|       |   +-- index.css        # Tailwind + custom styles
|       |-- Dockerfile           # Frontend container (nginx)
|       +-- nginx.conf           # Reverse proxy config
|
|-- spotify_data/                # Uploaded Spotify history (gitignored)
|-- apple_music_data/            # Uploaded Apple Music data (gitignored)
|   |-- csvs/                    #   Play History Daily Tracks
|   +-- jsons/                   #   Library Tracks (genre metadata)
|-- downloads/                   # Downloaded audio files (gitignored)
+-- .github/workflows/ci-cd.yml # GitHub Actions pipeline
```

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs on push and PR to `main`/`master`:

| Job | Trigger | What it does |
|-----|---------|--------------|
| **Lint and Test** | Push / PR | Runs flake8 (Python), ESLint (React), builds frontend |
| **Security Scan** | Push / PR | Runs Bandit SAST, checks for hardcoded secrets |
| **Build Docker Images** | Push to main/master only | Builds and pushes images to GitHub Container Registry (ghcr.io) |

No manual setup is required. The workflow uses the built-in `GITHUB_TOKEN` for registry authentication.

---

## Environment Variables

Copy `.env.example` to `.env` to configure tokens for local use:

```bash
cp .env.example .env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_PAT` | GitHub Personal Access Token (for GHCR access) | Optional |

The `.env` file is gitignored and will never be committed.
