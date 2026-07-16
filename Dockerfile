FROM node:23.6.1
WORKDIR /app

RUN apt-get update && \
    apt-get -y install ffmpeg python3-pip libsodium-dev build-essential python3 && \
    apt-get clean autoclean && \
    python3 -m pip install -U yt-dlp==2026.07.04 --break-system-packages

COPY . ./

RUN npm install

CMD npm run start