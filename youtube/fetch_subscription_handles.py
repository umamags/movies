#!/usr/bin/env python3
"""Fetch the @handle of every channel your Google account (umamags@gmail.com)
is subscribed to on YouTube.

Subscriptions are private data, so this requires OAuth 2.0 sign-in (an API
key alone is not enough). On first run it opens a browser for you to log in
and consent; the resulting token is cached so later runs don't prompt again.

Usage:
    python3 fetch_subscription_handles.py -o subscriptions.csv
"""
import argparse
import csv
import os
import pickle
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GMAIL_CONFIG_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "gmail_config")
CLIENT_SECRETS_FILE = os.path.join(GMAIL_CONFIG_DIR, "credentials.json")
TOKEN_FILE = os.path.join(GMAIL_CONFIG_DIR, "youtube_token.pkl")
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]


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
    """Return list of {channel_id, title} for every subscription."""
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
            })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return subs


def fetch_handles(youtube, channel_ids):
    """Return {channel_id: handle_or_empty} by batching channels.list calls."""
    handles = {}
    for i in range(0, len(channel_ids), 50):
        batch = channel_ids[i:i + 50]
        resp = youtube.channels().list(part="snippet", id=",".join(batch)).execute()
        for item in resp.get("items", []):
            handles[item["id"]] = item["snippet"].get("customUrl", "")
    return handles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", default="subscriptions.csv", help="Output CSV path")
    args = parser.parse_args()

    if not os.path.exists(CLIENT_SECRETS_FILE):
        sys.exit(f"Error: OAuth client secrets not found at {CLIENT_SECRETS_FILE}")

    creds = get_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    print("Fetching subscriptions...", file=sys.stderr)
    subs = fetch_subscriptions(youtube)
    print(f"  {len(subs)} subscriptions found", file=sys.stderr)

    print("Resolving handles...", file=sys.stderr)
    handles = fetch_handles(youtube, [s["channel_id"] for s in subs])

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["channel_title", "handle", "channel_id"])
        writer.writeheader()
        for s in subs:
            writer.writerow({
                "channel_title": s["title"],
                "handle": handles.get(s["channel_id"], ""),
                "channel_id": s["channel_id"],
            })

    print(f"Wrote {len(subs)} rows to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
