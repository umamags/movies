Movies
======

Tools for pulling video metadata from the YouTube channels I'm subscribed to
(account: umamags@gmail.com).

## Layout

### `gmail_config/`
OAuth client credentials and cached tokens used to sign in to Google APIs.
- `credentials.json` — Google Cloud "Desktop app" OAuth client (client id/secret). Gitignored.
- `gmail_config.json` — local config pointing at the credentials/token file names. Gitignored.
- `token.pkl`, `youtube_token.pkl` — cached OAuth tokens from prior sign-ins (Gmail-readonly and YouTube-readonly scopes respectively).

### `youtube/`
- `fetch_subscription_handles.py` — signs in as umamags@gmail.com via OAuth (`youtube.readonly` scope), lists every channel the account is subscribed to (`subscriptions.list`), resolves each to its `@handle` (`channels.list`), and writes `subscriptions.csv` with columns `channel_title, handle, channel_id, run`.
- `subscriptions.csv` — one row per subscribed channel. Set `run` to `yes` for the channels you actually want video data pulled for; everything else is skipped.
- `fetch_youtube_channel_videos.py` — for every channel where `run` is `yes`, walks that channel's uploads playlist (via `YOUTUBE_API_KEY`, no OAuth needed) and writes each video's title, video_id, url, published date, description, and thumbnail to its own JSON file at `youtube/json/<handle>.json`.
  - Progress is checkpointed to `youtube/youtube_state.json` after every API page fetched, so if a run hits YouTube's rate limit or daily quota, rerunning picks up exactly where it stopped instead of starting over.
  - Channels that have already been fully fetched are cheap to re-check: the script pages back only until it re-encounters the newest video already on disk, so subsequent runs effectively fetch just what's new.

## Setup
- `YOUTUBE_API_KEY` must be set in the environment — used for all public read calls (channel, playlist, and video lookups).
- `gmail_config/credentials.json` is only needed the first time `fetch_subscription_handles.py` runs, to complete the one-time browser OAuth consent.

## Typical workflow
1. Run `fetch_subscription_handles.py` (once, or whenever your subscriptions change) to refresh `subscriptions.csv`.
2. Set `run` to `yes` for whichever channels you want data for.
3. Run `fetch_youtube_channel_videos.py` to pull/refresh video data for those channels into `youtube/json/`.
