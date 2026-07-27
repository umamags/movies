#!/usr/bin/env python3
"""Fetch all videos for every channel listed in subscriptions.csv whose
"run" column is set to "yes".

Channels come from a CSV with columns: channel_title, handle, channel_id, run
(the output of fetch_subscription_handles.py, with a "run" column added).

Each channel's videos are written to their own JSON file under json/,
named after the channel's handle (or channel_id if no handle is set).

State is checkpointed to a JSON file after every page fetch, so if the
YouTube API rate-limits or quota-exhausts the run, simply rerun the script
and it resumes exactly where it stopped instead of re-fetching everything.
On top of that, already-fully-fetched channels are re-checked cheaply on
each run and only newly published videos are pulled in.

Usage:
    python3 fetch_youtube_channel_videos.py

Requires YOUTUBE_API_KEY in the environment.
"""
import argparse
import csv
import json
import os
import sys
import time
import requests

API_BASE = "https://www.googleapis.com/youtube/v3"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SUBSCRIPTIONS = os.path.join(SCRIPT_DIR, "subscriptions.csv")
DEFAULT_STATE = os.path.join(SCRIPT_DIR, "youtube_state.json")
DEFAULT_JSON_DIR = os.path.join(SCRIPT_DIR, "json")


class RateLimited(Exception):
    pass


def api_get(path, params, api_key, retries=3):
    params = {**params, "key": api_key}
    for attempt in range(retries):
        resp = requests.get(f"{API_BASE}/{path}", params=params)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code in (403, 429):
            try:
                reason = resp.json()["error"]["errors"][0]["reason"]
            except (ValueError, KeyError, IndexError):
                reason = ""
            if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"):
                raise RateLimited(reason)
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
        resp.raise_for_status()
    raise RuntimeError(f"Failed to fetch {path} after {retries} attempts")


def load_channels(subscriptions_path):
    channels = []
    with open(subscriptions_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("channel_id") and row.get("run", "").strip().lower() == "yes":
                channels.append(row)
    return channels


def load_state(state_path):
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as f:
            return json.load(f)
    return {"channels": {}}


def save_state(state_path, state):
    tmp = state_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, state_path)


def channel_json_path(json_dir, channel):
    handle = (channel.get("handle") or "").strip().lstrip("@")
    name = handle or channel["channel_id"]
    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
    return os.path.join(json_dir, f"{safe_name}.json")


def load_channel_videos(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return []


def save_channel_videos(path, videos):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2)
    os.replace(tmp, path)


def best_thumbnail(thumbnails):
    for quality in ("maxres", "standard", "high", "medium", "default"):
        if quality in thumbnails:
            return thumbnails[quality]["url"]
    return ""


def get_uploads_playlist(channel_id, api_key, channel_state):
    if "uploads_playlist" in channel_state:
        return channel_state["uploads_playlist"]
    data = api_get("channels", {"part": "contentDetails", "id": channel_id}, api_key)
    items = data.get("items", [])
    if not items:
        return None
    playlist_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    channel_state["uploads_playlist"] = playlist_id
    return playlist_id


def fetch_new_videos(channel, channel_state, known_video_ids, api_key):
    """Fetch videos newer than what's already known, resuming from any
    saved page token. Returns list of new video dicts (newest first)."""
    uploads_playlist = get_uploads_playlist(channel["channel_id"], api_key, channel_state)
    if not uploads_playlist:
        return []

    new_videos = []
    page_token = channel_state.get("resume_page_token")
    while True:
        params = {
            "part": "snippet,contentDetails",
            "playlistId": uploads_playlist,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        data = api_get("playlistItems", params, api_key)

        hit_known = False
        for item in data.get("items", []):
            snippet = item["snippet"]
            video_id = item["contentDetails"]["videoId"]
            if video_id in known_video_ids:
                hit_known = True
                break
            new_videos.append({
                "channel_handle": channel.get("handle", ""),
                "channel_title": channel.get("channel_title", ""),
                "title": snippet["title"],
                "video_id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "published_at": snippet.get("publishedAt", ""),
                "description": snippet.get("description", ""),
                "thumbnail": best_thumbnail(snippet.get("thumbnails", {})),
            })

        if hit_known:
            channel_state["resume_page_token"] = None
            break

        next_token = data.get("nextPageToken")
        channel_state["resume_page_token"] = next_token
        if not next_token:
            break
        page_token = next_token

    return new_videos


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-i", "--input", default=DEFAULT_SUBSCRIPTIONS, help="Subscriptions CSV path")
    parser.add_argument("--state", default=DEFAULT_STATE, help="State checkpoint file")
    parser.add_argument("--json-dir", default=DEFAULT_JSON_DIR, help="Directory for per-channel JSON output")
    args = parser.parse_args()

    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        sys.exit("Error: YOUTUBE_API_KEY not set in environment")

    channels = load_channels(args.input)
    if not channels:
        sys.exit(f"Error: no channels found in {args.input}")

    os.makedirs(args.json_dir, exist_ok=True)
    state = load_state(args.state)

    total_new = 0
    total_videos = 0
    for channel in channels:
        channel_id = channel["channel_id"]
        channel_state = state["channels"].setdefault(channel_id, {})
        label = channel.get("handle") or channel.get("channel_title") or channel_id
        out_path = channel_json_path(args.json_dir, channel)
        print(f"Checking {label}...", file=sys.stderr)

        videos = load_channel_videos(out_path)
        videos_by_id = {v["video_id"]: v for v in videos}
        known_video_ids = set(videos_by_id.keys())

        try:
            new_videos = fetch_new_videos(channel, channel_state, known_video_ids, api_key)
        except RateLimited as e:
            print(f"Rate limited ({e}). Saving progress; rerun later to continue.", file=sys.stderr)
            save_state(args.state, state)
            save_channel_videos(out_path, list(videos_by_id.values()))
            sys.exit(1)

        for v in new_videos:
            videos_by_id[v["video_id"]] = v
        total_new += len(new_videos)
        total_videos += len(videos_by_id)
        if new_videos:
            print(f"  {len(new_videos)} new video(s)", file=sys.stderr)

        save_state(args.state, state)
        save_channel_videos(out_path, list(videos_by_id.values()))

    print(f"Done. {total_new} new video(s) this run, {total_videos} total across {len(channels)} channel(s).", file=sys.stderr)


if __name__ == "__main__":
    main()
