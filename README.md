# Music Bot for Discord

## Requirements

- node v23.6.1
- npm v10.9.2
- FFmpeg: It must be installed on your system PATH to handle local stream processing.

## Project setup

```bash
npm install
```

The script needs a .env file inside the root directory, containing:

- TOKEN
- CLIENT_ID
- GUILD_ID
- LOCAL_DIR_PATH

## Spotify App Setup

Register a new App on the website: https://developer.spotify.com/dashboard

Then copy the two given variables in the .env file:
- SPOTIFY_CLIENT_ID
- SPOTIFY_CLIENT_SECRET

For a better compatibility please update in the Dockerfile the latest yt-dlp version.

## Run

```bash
npm run start
```

## Docker

```bash
docker build -t discordbot .
docker run -dit discordbot
```
