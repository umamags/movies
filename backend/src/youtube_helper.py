#!/usr/bin/env python3
"""YouTube API helper for fetching channel videos and playlist information."""
import os
import pickle
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Determine paths relative to this file
# youtube_helper.py is in /Users/maheshnatarajan/workspace/movies/backend/src
# gmail_config is in /Users/maheshnatarajan/workspace/movies/gmail_config
SCRIPT_DIR = Path(__file__).parent
MOVIES_DIR = SCRIPT_DIR.parent.parent  # Go up to movies directory
GMAIL_CONFIG_DIR = MOVIES_DIR / "gmail_config"
CLIENT_SECRETS_FILE = GMAIL_CONFIG_DIR / "credentials.json"
TOKEN_FILE = GMAIL_CONFIG_DIR / "youtube_token.pkl"
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]


def get_credentials():
    """Get YouTube API credentials with OAuth2 token caching."""
    creds = None

    if TOKEN_FILE.exists():
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    elif not creds or not creds.valid:
        if not CLIENT_SECRETS_FILE.exists():
            raise FileNotFoundError(
                f"OAuth client secrets not found at {CLIENT_SECRETS_FILE}\n"
                "Please run the YouTube setup first."
            )
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
        creds = flow.run_local_server(port=0)

    with open(TOKEN_FILE, "wb") as f:
        pickle.dump(creds, f)

    return creds


def get_youtube_service():
    """Build and return YouTube API service."""
    creds = get_credentials()
    return build("youtube", "v3", credentials=creds)


def extract_channel_id(url):
    """Extract channel ID from various YouTube channel URL formats.

    Supports:
    - https://www.youtube.com/@channelname
    - https://www.youtube.com/c/ChannelName
    - https://www.youtube.com/channel/UCxxxxxx
    """
    youtube = get_youtube_service()

    # If it's already a channel ID
    if url.startswith("UC") and len(url) == 24:
        return url

    # Try to extract from URL
    if "@" in url:
        handle = url.split("@")[-1].split("/")[0].split("?")[0]
        # Query by custom URL
        resp = youtube.search().list(
            part="snippet",
            type="channel",
            q=handle,
            maxResults=1
        ).execute()

        if resp.get("items"):
            return resp["items"][0]["snippet"]["channelId"]
    elif "/channel/" in url:
        channel_id = url.split("/channel/")[-1].split("?")[0]
        return channel_id
    elif "/c/" in url:
        channel_name = url.split("/c/")[-1].split("?")[0]
        resp = youtube.search().list(
            part="snippet",
            type="channel",
            q=channel_name,
            maxResults=1
        ).execute()

        if resp.get("items"):
            return resp["items"][0]["snippet"]["channelId"]

    raise ValueError(f"Could not extract channel ID from URL: {url}")


def fetch_channel_videos(channel_url, page_token=None, search_query=""):
    """Fetch videos from a YouTube channel.

    Args:
        channel_url: YouTube channel URL
        page_token: Token for pagination
        search_query: Optional search string to filter videos

    Returns:
        {
            "videos": [{"id", "title", "duration", "views", "published"}],
            "nextPageToken": "...",
            "totalCount": 50
        }
    """
    try:
        youtube = get_youtube_service()
        channel_id = extract_channel_id(channel_url)

        # Get uploads playlist ID
        channel_resp = youtube.channels().list(
            part="contentDetails",
            id=channel_id
        ).execute()

        if not channel_resp.get("items"):
            raise ValueError(f"Channel not found: {channel_url}")

        uploads_playlist = channel_resp["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

        # Fetch videos from uploads playlist
        videos_resp = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=uploads_playlist,
            maxResults=50,
            pageToken=page_token
        ).execute()

        videos = []
        video_ids = []

        for item in videos_resp.get("items", []):
            video_id = item["contentDetails"]["videoId"]
            title = item["snippet"]["title"]

            # Apply search filter
            if search_query and search_query.lower() not in title.lower():
                continue

            video_ids.append(video_id)
            videos.append({
                "id": video_id,
                "title": title,
                "published": item["snippet"]["publishedAt"],
                "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"],
            })

        # Get duration and view count for filtered videos
        if video_ids:
            stats_resp = youtube.videos().list(
                part="statistics,contentDetails",
                id=",".join(video_ids)
            ).execute()

            stats_map = {}
            for item in stats_resp.get("items", []):
                stats_map[item["id"]] = {
                    "duration": item["contentDetails"]["duration"],
                    "views": int(item["statistics"].get("viewCount", 0))
                }

            for video in videos:
                stats = stats_map.get(video["id"], {})
                video["duration"] = stats.get("duration", "PT0S")
                video["views"] = stats.get("views", 0)

        return {
            "videos": videos,
            "nextPageToken": videos_resp.get("nextPageToken"),
            "totalCount": len(videos),
        }

    except Exception as e:
        raise Exception(f"Failed to fetch channel videos: {str(e)}")


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing channel URL"}))
        sys.exit(1)

    channel_url = sys.argv[1]
    page_token = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "null" else None
    search_query = sys.argv[3] if len(sys.argv) > 3 else ""

    try:
        result = fetch_channel_videos(channel_url, page_token, search_query)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
