# Music Bot for Discord

## Requirements

- node v23.6.1
- npm v10.9.2

## Project setup

```bash
npm install
```

The script needs a .env file inside the root directory, containing:

- TOKEN
- CLIENT_ID
- GUILD_ID
- LOCAL_DIR_PATH

## Run

```bash
npm run start
```

## Docker

```bash
docker build -t discordbot .
docker run -dit discordbot
```
