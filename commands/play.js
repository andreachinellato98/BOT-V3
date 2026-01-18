import { AudioPlayerStatus, createAudioPlayer, joinVoiceChannel, VoiceConnectionStatus, getVoiceConnection } from "@discordjs/voice";
import youtubedl from "youtube-dl-exec";
import { YouTube } from "youtube-sr";
import playSong from "../playSong.js";
import { parseFile } from "music-metadata";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
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

const fetchYouTubeInfo = async (url) => {
  return await youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ["referer: https://www.youtube.com", "user-agent: Mozilla/5.0"],
    socketTimeout: 5
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

    let song = {};

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

        song = {
          url: null,
          title: matchingFile,
          lengthSeconds: duration,
          localPath: fullPath,
          thumbnail: null,
          sourceFrom: 'local'
        };
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
          song = archiveInfo;
          console.log(`✅ | Archive.org found: ${song.title}`);
        } catch (err) {
          console.error("❌ | Archive.org fetch failed:", err.message);
          return interaction.editReply(`❌ | Failed to fetch from Archive.org: ${err.message}`);
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
          song = {
            url: url,
            title: info.title || "Unknown Title",
            lengthSeconds: 0,
            thumbnail: info.thumbnail || null,
            sourceFrom: 'bitchute'
          };
        } catch (err) {
          console.error("❌ | Bitchute fetch failed:", err.message);

          song = {
            url: url,
            title: `Bitchute Video ${videoId}`,
            lengthSeconds: 0,
            thumbnail: null,
            sourceFrom: 'bitchute'
          };
        }
      }
      // YOUTUBE
      else {
        let url = input;
        const videoId = extractVideoId(input);

        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        } else if (!isValidURL(input)) {
          const results = await YouTube.search(input, { limit: 1 });
          if (!results?.length) return interaction.editReply("❌ | No results");
          url = `https://www.youtube.com/watch?v=${results[0].id}`;
        }

        try {
          const info = await fetchYouTubeInfo(url);
          song = {
            url: url,
            title: info.title || input,
            lengthSeconds: Math.floor(info.duration || 0),
            thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || null,
            sourceFrom: 'youtube'
          };
        } catch (err) {
          console.error("❌ | YouTube fetch failed:", err.message);
          if (isValidURL(input)) {
            song = { url: input, title: "Unknown", lengthSeconds: 0, thumbnail: null, sourceFrom: 'unknown' };
          } else {
            return interaction.editReply("🚫 | Metadata failed. Use direct URL.");
          }
        }
      }

      // GESTIONE CODA
      serverQueue = queue.get(interaction.guild.id);

      // Aggiungo a coda esistente
      if (serverQueue?.songs?.length > 0) {
        serverQueue.songs.push(song);
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
        serverQueue.songs.push(song);
        
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
          songs: [song],
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
        songs: [song],
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
            connection.reconnect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
        } catch {
          connection.destroy();
          queue.delete(interaction.guild.id);
        }
      });

      connection.on(VoiceConnectionStatus.Ready, async () => {
        queueConstruct.connection = connection;
        playSong(interaction.guild, queueConstruct.songs[0], queue, true);
        await sendNowPlayingEmbed(interaction, song, queueConstruct);
        
        const reply = await interaction.fetchReply();
        queueConstruct.lastMessageId = reply.id;
      });

    } catch (error) {
      console.error("❌ | Play error:", error);
      return interaction.editReply("❌ | Error occurred");
    }
  }
};