#!/usr/bin/env python3
"""Fetch the @handle of every channel your Google account (umamags@gmail.com)
is subscribed to on YouTube.

Subscriptions are private data, so this requires OAuth 2.0 sign-in (an API
key alone is not enough). On first run it opens a browser for you to log in
and consent; the resulting token is cached so later runs don't prompt again.

Usage:
    python3 fetch_subscription_handles.py
"""
import argparse
import csv
import os
import pickle
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GMAIL_CONFIG_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "gmail_config")
CLIENT_SECRETS_FILE = os.path.join(GMAIL_CONFIG_DIR, "credentials.json")
TOKEN_FILE = os.path.join(GMAIL_CONFIG_DIR, "youtube_token.pkl")
DEFAULT_OUTPUT = os.path.join(SCRIPT_DIR, "subscriptions.csv")
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]
CSV_FIELDS = [
    "channel_title",
    "handle",
    "channel_id",
    "subscribed_at",
    "video_count",
    "last_published_at",
]


def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    elif not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
        creds = flow.run_local_server(port=0)

    with open(TOKEN_FILE, "wb") as f:
        pickle.dump(creds, f)

    return creds


def fetch_subscriptions(youtube):
    """Return list of {channel_id, title, subscribed_at} for every subscription.

    subscribed_at is the YYYY-MM-DD date the subscription was made (snippet.publishedAt).
    """
    subs = []
    page_token = None
    while True:
        resp = youtube.subscriptions().list(
            part="snippet",
            mine=True,
            maxResults=50,
            pageToken=page_token,
        ).execute()
        for item in resp.get("items", []):
            resource = item["snippet"]["resourceId"]
            subs.append({
                "channel_id": resource["channelId"],
                "title": item["snippet"]["title"],
                "subscribed_at": item["snippet"].get("publishedAt", "")[:10],
            })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return subs


def fetch_channel_details(youtube, channel_ids):
    """Return {channel_id: {handle, video_count, uploads_playlist}} via batched channels.list calls."""
    details = {}
    for i in range(0, len(channel_ids), 50):
        batch = channel_ids[i:i + 50]
        resp = youtube.channels().list(
            part="snippet,statistics,contentDetails",
            id=",".join(batch),
        ).execute()
        for item in resp.get("items", []):
            details[item["id"]] = {
                "handle": item["snippet"].get("customUrl", ""),
                "video_count": item.get("statistics", {}).get("videoCount", ""),
                "uploads_playlist": item["contentDetails"]["relatedPlaylists"].get("uploads", ""),
            }
    return details


def fetch_last_published(youtube, uploads_playlist):
    """Return YYYY-MM-DD of the channel's newest upload, or "" if it has none."""
    if not uploads_playlist:
        return ""
    try:
        resp = youtube.playlistItems().list(
            part="contentDetails",
            playlistId=uploads_playlist,
            maxResults=1,
        ).execute()
    except HttpError as e:
        print(f"  warning: could not read uploads for {uploads_playlist}: {e}", file=sys.stderr)
        return ""
    items = resp.get("items", [])
    if not items:
        return ""
    return items[0]["contentDetails"].get("videoPublishedAt", "")[:10]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT, help="Output CSV path")
    args = parser.parse_args()

    if not os.path.exists(CLIENT_SECRETS_FILE):
        sys.exit(f"Error: OAuth client secrets not found at {CLIENT_SECRETS_FILE}")

    creds = get_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    print("Fetching subscriptions...", file=sys.stderr)
    subs = fetch_subscriptions(youtube)
    print(f"  {len(subs)} subscriptions found", file=sys.stderr)

    print("Resolving channel details...", file=sys.stderr)
    details = fetch_channel_details(youtube, [s["channel_id"] for s in subs])

    print("Fetching last published dates...", file=sys.stderr)
    rows = []
    for n, s in enumerate(subs, 1):
        d = details.get(s["channel_id"], {})
        rows.append({
            "channel_title": s["title"],
            "handle": d.get("handle", ""),
            "channel_id": s["channel_id"],
            "subscribed_at": s["subscribed_at"],
            "video_count": d.get("video_count", ""),
            "last_published_at": fetch_last_published(youtube, d.get("uploads_playlist", "")),
        })
        if n % 10 == 0 or n == len(subs):
            print(f"  {n}/{len(subs)}", file=sys.stderr)

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
