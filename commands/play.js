import { 
  AudioPlayerStatus, 
  createAudioPlayer, 
  joinVoiceChannel, 
  VoiceConnectionStatus, 
  getVoiceConnection,
  entersState 
} from "@discordjs/voice";
import youtubedl from "youtube-dl-exec";
import { YouTube } from "youtube-sr";
import playSong from "../playSong.js";
import { parseFile } from "music-metadata";
import path from "path";
import { promisify } from "util";
import { exec, spawn } from "child_process";
import fs from "fs";
import { sendNowPlayingEmbed } from '../embedHandling/handleMusicButton.js';
import { sendAddedQueue } from '../embedHandling/addedQueue.js';

const execAsync = promisify(exec);

const getDuration = async (filePath) => {
  try {
    const metadata = await parseFile(filePath);
    return Math.floor(metadata.format.duration);
  } catch {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return Math.floor(parseFloat(stdout));
  }
};

const isValidURL = (string) => {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/*const fetchYouTubeInfo = async (url) => {
  return await youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ["referer: https://www.youtube.com", "user-agent: Mozilla/5.0"],
    socketTimeout: 5
  });
};*/

const fetchYouTubeInfo = async (url) => {
  return new Promise((resolve, reject) => {
    const ytProcess = spawn("yt-dlp", [
      "--dump-single-json",
      "--no-warnings",
      "--no-check-certificates",
      url
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    // Timeout di 15 secondi
    const timeout = setTimeout(() => {
      ytProcess.kill("SIGKILL");
      reject(new Error("yt-dlp timeout after 15s"));
    }, 15000);

    ytProcess.stdout.on("data", (data) => stdout += data.toString());
    ytProcess.stderr.on("data", (data) => {
      console.log(`yt-dlp meta stderr: ${data.toString()}`); // DEBUG
      stderr += data.toString();
    });

    ytProcess.on("close", (code) => {
      clearTimeout(timeout);
      console.log(`yt-dlp meta closed with code: ${code}`); // DEBUG
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Failed to parse yt-dlp JSON output"));
      }
    });

    ytProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
};

const extractVideoId = (input) => {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
      if (url.searchParams.has("v")) {
        return url.searchParams.get("v");
      }
      // formato youtu.be/<id>
      const path = url.pathname.split("/");
      return path[path.length - 1];
    }
  } catch {
    // non è un URL valido
  }
  return null;
}

// ------------ BITCHUTE FUNCTIONS ------------

function extractBitchuteVideoId(input) {
  const match = input.match(/bitchute\.com\/video\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

const isBitchuteUrl = (input) => {
  try {
    return /bitchute\.com\/video\/([a-zA-Z0-9_-]+)/i.test(input);
  } catch {
    return false;
  }
};

async function fetchBitchuteInfo(videoId) {
  const url = `https://www.bitchute.com/video/${videoId}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    const title = titleMatch ? titleMatch[1] : "Unknown Title";
    
    const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1] : null;
    
    return {
      title,
      thumbnail,
      url
    };
  } catch (error) {
    console.error("Error fetching Bitchute info:", error);
    throw error;
  }
}

// ------------ ARCHIVE.ORG FUNCTIONS ------------

const isArchiveUrl = (input) => {
  try {
    const url = new URL(input);
    return url.hostname.includes('archive.org');
  } catch {
    return false;
  }
};

const extractArchiveIdentifier = (url) => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    // Formati supportati:
    // https://archive.org/details/{identifier}
    // https://archive.org/details/{identifier}/{filename}
    // https://archive.org/download/{identifier}/{filename}
    // https://archive.org/embed/{identifier}
    
    if (pathParts.length >= 2 && (pathParts[0] === 'details' || pathParts[0] === 'download' || pathParts[0] === 'embed')) {
      if (pathParts.length >= 3) {
        return {
          identifier: pathParts[1],
          filename: decodeURIComponent(pathParts.slice(2).join('/'))
        };
      }
      return { identifier: pathParts[1], filename: null };
    }
  } catch {
    return null;
  }
  return null;
};

const fetchArchiveInfo = async (identifier, specificFilename = null) => {
  try {
    const response = await fetch(`https://archive.org/metadata/${identifier}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.files || data.files.length === 0) {
      throw new Error('No files found in this item');
    }
    
    let audioFile = null;
    
    if (specificFilename) {

      const normalizedSearch = specificFilename.replace(/\+/g, ' ');

      audioFile = data.files.find(f => {
        const normalizedFile = f.name.replace(/\+/g, ' ');
        return f.name === specificFilename || 
          normalizedFile === normalizedSearch ||
          decodeURIComponent(f.name) === normalizedSearch ||
          f.name === normalizedSearch;
      });
      
      if (!audioFile) {
        throw new Error(`File '${specificFilename}' not found in this item`);
      }
      
      console.log(`🎯 | Found specific file: ${audioFile.name}`);
    }
    else {
      // Priorità formati audio (dal migliore al più compatibile per discord)
      const formatPriority = [
        'Flac',
        'VBR MP3',
        '320Kbps MP3', 
        '256Kbps MP3',
        '192Kbps MP3',
        '128Kbps MP3',
        'Ogg Vorbis',
        'MP3',
        'MPEG4'
      ];
      
      // Ordine di priorità per formati
      for (const format of formatPriority) {
        audioFile = data.files.find(f => f.format === format);
        if (audioFile) break;
      }
      
      // Fallback: cerca qualsiasi file audio
      if (!audioFile) {
        audioFile = data.files.find(f => 
          f.name?.match(/\.(mp3|ogg|flac|m4a|wav|opus|mp4|webm)$/i) ||
          f.format?.toLowerCase().includes('audio')
        );
      }
      
      if (!audioFile) {
        throw new Error('No audio file found in this item');
      }
    }
    
    // Buildo l'URL diretto del file
    const downloadUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(audioFile.name)}`;
    
    // Tiro fuori metadati
    let title;
    if (specificFilename) {
      title = specificFilename.replace(/\.[^/.]+$/, '').replace(/\+/g, ' ');
    } else {
      title = data.metadata.title || 
              data.metadata.identifier || 
              audioFile.name.replace(/\.[^/.]+$/, '');
    }
    
    // Durata file (se disponibile)
    let duration = 0;
    if (audioFile.length) {
      const lengthStr = String(audioFile.length);
      // Il campo length è in formato "HH:MM:SS" o secondi
      if (lengthStr.includes(':')) {
        const parts = lengthStr.split(':').map(p => parseInt(p) || 0);
        if (parts.length === 3) {
          duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          duration = parts[0] * 60 + parts[1];
        }
      } else {
        duration = Math.floor(parseFloat(lengthStr)) || 0;
      }
    }
    
    return {
      url: downloadUrl,
      title: title,
      lengthSeconds: duration,
      thumbnail: `https://archive.org/services/img/${identifier}`,
      identifier: identifier,
      sourceFrom: 'archive'
    };
    
  } catch (err) {
    throw new Error(`Archive.org fetch failed: ${err.message}`);
  }
};

const searchArchive = async (query) => {
  try {
    const searchUrl = new URL('https://archive.org/advancedsearch.php');
    
    const fullQuery = `(title:("${query}") AND mediatype:audio`;
    
    searchUrl.searchParams.set('q', fullQuery);
    searchUrl.searchParams.set('fl[]', 'identifier');
    searchUrl.searchParams.set('fl[]', 'title');
    searchUrl.searchParams.set('fl[]', 'creator');
    searchUrl.searchParams.set('sort[]', 'downloads desc');
    searchUrl.searchParams.set('rows', '10');
    searchUrl.searchParams.set('page', '1');
    searchUrl.searchParams.set('output', 'json');
    
    console.log(`🔍 | Searching Archive.org for: "${query}"`);
    console.log(`🔗 | URL: ${searchUrl.toString()}`);
    
    const response = await fetch(searchUrl.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data.response || !data.response.docs || data.response.docs.length === 0) {
      throw new Error('No results found');
    }

    console.log(`📋 | Found ${data.response.docs.length} results`);
    
    return data.response.docs;

  } catch (err) {
    throw new Error(`Archive.org search failed: ${err.message}`);
  }
};

// ---------- END ARCHIVE.ORG FUNCTIONS ----------

// ------------ SPOTIFY FUNCTIONS ------------
// Bridge: Spotify non permette lo streaming diretto dell'audio via API pubbliche,
// quindi recupero solo i METADATI da Spotify (titolo, artisti, durata, cover)
// e poi eseguo bridge su Youtube.

const MAX_SPOTIFY_TRACKS = 50; // limite di sicurezza per playlist/album molto lunghi

let spotifyToken = null;
let spotifyTokenExpiry = 0;

const isSpotifyUrl = (input) => {
  try {
    const url = new URL(input);
    return url.hostname.includes("spotify.com") &&
      /\/(track|album|playlist)\//.test(url.pathname);
  } catch {
    return false;
  }
};

const extractSpotifyInfo = (input) => {
  try {
    const url = new URL(input);
    const parts = url.pathname.split("/").filter(Boolean);
    // Supporta anche varianti localizzate tipo /intl-it/track/{id}
    const typeIndex = parts.findIndex(p => ["track", "album", "playlist"].includes(p));
    if (typeIndex === -1 || !parts[typeIndex + 1]) return null;
    return {
      type: parts[typeIndex],
      id: parts[typeIndex + 1].split("?")[0]
    };
  } catch {
    return null;
  }
};

const getSpotifyToken = async () => {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) {
    return spotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  spotifyToken = data.access_token;
  // rinnovo con 60s di margine prima della scadenza reale
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken;
};

const fetchSpotifyTrack = async (trackId) => {
  const token = await getSpotifyToken();
  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Spotify track fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    title: data.name,
    artists: data.artists.map(a => a.name).join(", "),
    durationMs: data.duration_ms,
    thumbnail: data.album?.images?.[0]?.url || null
  };
};

const fetchSpotifyPlaylistTracks = async (playlistId) => {
  const token = await getSpotifyToken();
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url && tracks.length < MAX_SPOTIFY_TRACKS) {
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Spotify playlist fetch failed: HTTP ${response.status}`);
    }
    const data = await response.json();

    for (const item of data.items) {
      if (!item.track) continue; // traccia rimossa o locale
      tracks.push({
        title: item.track.name,
        artists: item.track.artists.map(a => a.name).join(", "),
        durationMs: item.track.duration_ms,
        thumbnail: item.track.album?.images?.[0]?.url || null
      });
      if (tracks.length >= MAX_SPOTIFY_TRACKS) break;
    }

    url = data.next;
  }

  return tracks;
};

const fetchSpotifyAlbumTracks = async (albumId) => {
  const token = await getSpotifyToken();

  const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!albumResponse.ok) {
    throw new Error(`Spotify album fetch failed: HTTP ${albumResponse.status}`);
  }
  const albumData = await albumResponse.json();
  const thumbnail = albumData.images?.[0]?.url || null;

  const tracks = [];
  let url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  while (url && tracks.length < MAX_SPOTIFY_TRACKS) {
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Spotify album tracks fetch failed: HTTP ${response.status}`);
    }
    const data = await response.json();

    for (const item of data.items) {
      tracks.push({
        title: item.name,
        artists: item.artists.map(a => a.name).join(", "),
        durationMs: item.duration_ms,
        thumbnail
      });
      if (tracks.length >= MAX_SPOTIFY_TRACKS) break;
    }

    url = data.next;
  }

  return tracks;
};

// Prende una traccia Spotify (metadati) e trova il video YouTube corrispondente
const bridgeSpotifyTrackToYouTube = async (spotifyTrack) => {
  const query = `${spotifyTrack.artists} - ${spotifyTrack.title}`;
  const results = await YouTube.search(query, { limit: 1 });

  if (!results?.length) {
    throw new Error(`No YouTube match for "${query}"`);
  }

  const url = `https://www.youtube.com/watch?v=${results[0].id}`;
  const info = await fetchYouTubeInfo(url);

  return {
    url,
    title: query,
    lengthSeconds: Math.floor(
      info.duration || (spotifyTrack.durationMs ? spotifyTrack.durationMs / 1000 : 0)
    ),
    thumbnail: spotifyTrack.thumbnail || info.thumbnail || info.thumbnails?.[0]?.url || null,
    sourceFrom: 'spotify'
  };
};

// ---------- END SPOTIFY FUNCTIONS ----------

export default {
  name: "play",
  description: "Play a song or playlist",
  async execute(interaction, queue) {

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
    } catch (err) {
      console.error("❌ | Defer failed (probably already acknowledged):", err.message);
    }

    const input = interaction.options.getString("input");
    const localFlag = interaction.options.getBoolean("local");
    //const archiveFlag = interaction.options.getBoolean("archive");
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply("🎙️ | Join a voice channel first.");
    }

    // Pulisci connessioni distrutte
    let serverQueue = queue.get(interaction.guild.id);
    if (serverQueue?.connection?.destroyed) {
      if (serverQueue.ffmpegProcess) serverQueue.ffmpegProcess.kill('SIGKILL');
      if (serverQueue.disconnectTimeout) clearTimeout(serverQueue.disconnectTimeout);
      queue.delete(interaction.guild.id);
      serverQueue = null;
    }

    // Ogni ramo popola questo array. Anche un singolo brano è un array di 1 elemento,
    // così la gestione della coda più sotto è unificata per tutte le sorgenti.
    let songs = [];

    try {
      // FILE LOCALI
      if (localFlag) {
        const localDir = process.env.LOCAL_DIR_PATH;
        if (!localDir) return interaction.editReply("❌ | LOCAL_DIR_PATH not set");

        const files = fs.readdirSync(localDir);
        const supportedExts = [".mp3", ".mp4", ".m4a", ".ogg", ".wav", ".flac", ".mkv", ".webm"];
        const matchingFile = files.find(f => 
          f.toLowerCase().includes(input.toLowerCase()) && 
          supportedExts.some(ext => f.toLowerCase().endsWith(ext))
        );

        if (!matchingFile) return interaction.editReply(`📄❌ | No file: "${input}"`);

        const fullPath = path.join(localDir, matchingFile);
        let duration = null;
        try {
          duration = await Promise.race([
            getDuration(fullPath),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]);
        } catch {
          console.warn("⚠️ | Duration unavailable");
        }

        songs.push({
          url: null,
          title: matchingFile,
          lengthSeconds: duration,
          localPath: fullPath,
          thumbnail: null,
          sourceFrom: 'local'
        });
      }
      // ARCHIVE.ORG
      else if (isArchiveUrl(input)) {
        const result = extractArchiveIdentifier(input);
        if (!result || !result.identifier) {
          return interaction.editReply("❌ | Invalid Archive.org URL. Use format: https://archive.org/details/{identifier}");
        }
        
        try {
          console.log(`🎵 | Fetching Archive.org: ${result.identifier}${result.filename ? ` / ${result.filename}` : ''}`);
          const archiveInfo = await fetchArchiveInfo(result.identifier, result.filename);
          songs.push(archiveInfo);
          console.log(`✅ | Archive.org found: ${archiveInfo.title}`);
        } catch (err) {
          console.error("❌ | Archive.org fetch failed:", err.message);
          return interaction.editReply(`❌ | Failed to fetch from Archive.org: ${err.message}`);
        }
      }
      // SPOTIFY (bridge verso YouTube)
      else if (isSpotifyUrl(input)) {
        const spotifyInfo = extractSpotifyInfo(input);
        if (!spotifyInfo) {
          return interaction.editReply("❌ | Invalid Spotify URL. Usa un link track/album/playlist di Spotify.");
        }

        try {
          if (spotifyInfo.type === "track") {
            console.log(`🎵 | Fetching Spotify track: ${spotifyInfo.id}`);
            const track = await fetchSpotifyTrack(spotifyInfo.id);
            const bridged = await bridgeSpotifyTrackToYouTube(track);
            songs.push(bridged);
            console.log(`✅ | Spotify bridged: ${bridged.title}`);
          } else {
            console.log(`🎵 | Fetching Spotify ${spotifyInfo.type}: ${spotifyInfo.id}`);
            const tracks = spotifyInfo.type === "playlist"
              ? await fetchSpotifyPlaylistTracks(spotifyInfo.id)
              : await fetchSpotifyAlbumTracks(spotifyInfo.id);

            if (!tracks.length) {
              return interaction.editReply("❌ | Nessuna traccia trovata in questa playlist/album Spotify.");
            }

            await interaction.editReply(
              `🔄 | Trovate ${tracks.length} tracce su Spotify, sto cercando i corrispettivi su YouTube (potrebbe volerci un po')...`
            );

            for (const track of tracks) {
              try {
                const bridged = await bridgeSpotifyTrackToYouTube(track);
                songs.push(bridged);
              } catch (err) {
                console.warn(`⚠️ | Skip traccia Spotify "${track.title}": ${err.message}`);
              }
            }

            if (!songs.length) {
              return interaction.editReply("❌ | Nessuna traccia Spotify è stata trovata su YouTube.");
            }
          }
        } catch (err) {
          console.error("❌ | Spotify fetch failed:", err.message);
          return interaction.editReply(`❌ | Failed to fetch from Spotify: ${err.message}`);
        }
      }
      else if (isBitchuteUrl(input)) {
        const videoId = extractBitchuteVideoId(input);
        
        if (!videoId) {
          return interaction.editReply("❌ | Invalid Bitchute URL");
        }
        
        const url = `https://www.bitchute.com/video/${videoId}`;
        
        try {
          const info = await fetchBitchuteInfo(videoId);
          songs.push({
            url: url,
            title: info.title || "Unknown Title",
            lengthSeconds: 0,
            thumbnail: info.thumbnail || null,
            sourceFrom: 'bitchute'
          });
        } catch (err) {
          console.error("❌ | Bitchute fetch failed:", err.message);

          songs.push({
            url: url,
            title: `Bitchute Video ${videoId}`,
            lengthSeconds: 0,
            thumbnail: null,
            sourceFrom: 'bitchute'
          });
        }
      }
      // YOUTUBE
      else {
        console.log("🔍 | Entering YouTube branch");
        let url = input;
        const videoId = extractVideoId(input);

        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        } else if (!isValidURL(input)) {
          console.log("🔍 | Searching YouTube for:", input);
          const results = await YouTube.search(input, { limit: 1 });
          console.log("🔍 | Search results:", results?.length);
          if (!results?.length) return interaction.editReply("❌ | No results");
          url = `https://www.youtube.com/watch?v=${results[0].id}`;
        }

        console.log("🔍 | Fetching info for:", url);

        try {
          const info = await fetchYouTubeInfo(url);
          console.log("✅ | Info fetched:", info.title);
          songs.push({
            url: url,
            title: info.title || input,
            lengthSeconds: Math.floor(info.duration || 0),
            thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || null,
            sourceFrom: 'youtube'
          });
        } catch (err) {
          console.error("❌ | YouTube fetch failed:", err.message);
          if (isValidURL(input)) {
            songs.push({ url: input, title: "Unknown", lengthSeconds: 0, thumbnail: null, sourceFrom: 'unknown' });
          } else {
            return interaction.editReply("🚫 | Metadata failed. Use direct URL.");
          }
        }
      }

      const song = songs[0];

      // GESTIONE CODA
      serverQueue = queue.get(interaction.guild.id);

      // Aggiungo a coda esistente
      if (serverQueue?.songs?.length > 0) {
        serverQueue.songs.push(...songs);
        await sendAddedQueue(interaction, song, serverQueue);
        if (serverQueue.player.state.status === AudioPlayerStatus.Idle) {
          playSong(interaction.guild, serverQueue.songs[0], queue, true);
        }
        return;
      }

      // Coda vuota ma esiste
      if (serverQueue?.songs?.length === 0) {
        if (serverQueue.ffmpegProcess) serverQueue.ffmpegProcess.kill('SIGKILL');
        if (serverQueue.disconnectTimeout) clearTimeout(serverQueue.disconnectTimeout);
        serverQueue.player.removeAllListeners();
        serverQueue.songs.push(...songs);
        
        if (serverQueue.connection && !serverQueue.connection.destroyed) {
          playSong(interaction.guild, serverQueue.songs[0], queue, true);
          return await sendNowPlayingEmbed(interaction, song, serverQueue);
        }
      }

      // Riuso connessione esistente se il bot non si è disconnesso
      const existingConnection = getVoiceConnection(interaction.guild.id);
      if (existingConnection && !existingConnection.destroyed) {
        const queueConstruct = {
          textChannel: interaction.channel,
          voiceChannel: voiceChannel,
          connection: existingConnection,
          player: createAudioPlayer(),
          songs: songs,
          playing: true,
          reproduction: { startTimestamp: null, playedTime: 0, isPaused: false },
          lastMessageId: null,
          disconnectTimeout: null,
          ffmpegProcess: null,
          volume: 100
        };

        queue.set(interaction.guild.id, queueConstruct);
        existingConnection.subscribe(queueConstruct.player);
        playSong(interaction.guild, queueConstruct.songs[0], queue, true);
        await sendNowPlayingEmbed(interaction, song, queueConstruct);
        
        const reply = await interaction.fetchReply();
        queueConstruct.lastMessageId = reply.id;
        return;
      }

      // NUOVA CONNESSIONE
      const queueConstruct = {
        textChannel: interaction.channel,
        voiceChannel: voiceChannel,
        connection: null,
        player: createAudioPlayer(),
        songs: songs,
        playing: true,
        reproduction: { startTimestamp: null, playedTime: 0, isPaused: false },
        lastMessageId: null,
        disconnectTimeout: null,
        ffmpegProcess: null,
        volume: 100
      };

      queue.set(interaction.guild.id, queueConstruct);

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator
      });

      connection.on("error", (error) => {
        console.error("❌ | Connection error:", error);
        const cq = queue.get(interaction.guild.id);
        if (cq) {
          if (cq.ffmpegProcess) cq.ffmpegProcess.kill('SIGKILL');
          if (cq.disconnectTimeout) clearTimeout(cq.disconnectTimeout);
        }
        queue.delete(interaction.guild.id);
        interaction.editReply("❌ | Connection error").catch(() => {});
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            //connection.reconnect(),
            //new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
        } catch {
          if (!connection.destroyed) connection.destroy();
          queue.delete(interaction.guild.id);
        }
      });

      connection.on(VoiceConnectionStatus.Ready, async () => {
        console.log("✅ | Voice connection Ready!");
        queueConstruct.connection = connection;
        connection.subscribe(queueConstruct.player);
        playSong(interaction.guild, queueConstruct.songs[0], queue, true);
        await sendNowPlayingEmbed(interaction, song, queueConstruct);
        
        try {
          const reply = await interaction.fetchReply();
          queueConstruct.lastMessageId = reply.id;
        } catch (err) {
          console.warn("⚠️ | Could not fetch reply:", err.message);
        }
      });

      connection.on(VoiceConnectionStatus.Connecting, () => {
        console.log("🔄 | Voice connection Connecting...");
      });

      connection.on('stateChange', (oldState, newState) => {
        console.log(`🔁 | Connection state: ${oldState.status} → ${newState.status}`);
        
        // Debug networking
        if (newState.networking) {
          newState.networking.on('stateChange', (o, n) => {
            console.log(`🌐 | Networking state: ${o?.code ?? 'none'} → ${n?.code ?? 'none'}`);
          });
        }
      });

      connection.on("error", (error) => {
      console.error("❌ | Connection error:", error);
    });

    } catch (error) {
      console.error("❌ | Play error:", error);
      return interaction.editReply("❌ | Error occurred");
    }
  }
};