FROM node:23.6.1
WORKDIR /app

RUN apt-get update && \
    apt-get -y install ffmpeg python3-pip && \
    apt-get clean autoclean && \
    python3 -m pip install -U yt-dlp==2025.11.12 --break-system-packages

# COPY /root/.local/pipx/venvs/yt-dlp/bin/yt-dlp /usr/bin

COPY . ./

RUN npm install

CMD npm run start
