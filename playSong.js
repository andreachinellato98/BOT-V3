import { 
  AudioPlayerStatus, 
  createAudioResource,
  StreamType
} from "@discordjs/voice";
import { spawn } from "child_process";

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function updateMessageWithDisabledButtons(serverQueue) {
  if (!serverQueue.lastMessageId || !serverQueue.textChannel) return;
  
  try {
    const message = await serverQueue.textChannel.messages.fetch(serverQueue.lastMessageId);
    if (!message) return;
    
    await message.edit({
      components: []
    });
  } catch (err) {
    console.warn("⚠️ | Could not update message buttons:", err.message);
  }
}

function cleanupFFmpeg(serverQueue) {
  if (serverQueue.ffmpegProcess) {
    try {
      serverQueue.ffmpegProcess.kill("SIGKILL");
    } catch (err) {
      console.warn("⚠️ | Error killing ffmpeg:", err.message);
    }
    serverQueue.ffmpegProcess = null;
  }
}

function scheduleDisconnect(guild, queue, serverQueue) {
  // Pulisco timeout precedente
  if (serverQueue.disconnectTimeout) {
    clearTimeout(serverQueue.disconnectTimeout);
    serverQueue.disconnectTimeout = null;
  }

  serverQueue.disconnectTimeout = setTimeout(() => {
    const currentQueue = queue.get(guild.id);
    
    // Verifico che la coda sia ancora vuota prima di disconnettere
    if (currentQueue && currentQueue.songs.length === 0) {
      console.log(`🔌 | Disconnecting from ${guild.name} due to inactivity`);
      
      cleanupFFmpeg(currentQueue);
      
      if (currentQueue.connection && !currentQueue.connection.destroyed) {
        try {
          currentQueue.connection.destroy();
        } catch (err) {
          console.warn("⚠️ | Error destroying connection:", err.message);
        }
      }
      
      if (currentQueue.textChannel) {
        currentQueue.textChannel.send("❌ | Disconnected due to inactivity.").catch(() => {});
      }
      
      queue.delete(guild.id);
    }
  }, 10 * 60 * 1000); // 10 minuti
}

export default async function playSong(guild, song, queue, suppressMessage = true, seekSeconds = 0) {
  const serverQueue = queue.get(guild.id);
  
  if (!serverQueue) {
    console.warn("⚠️ | No server queue found for guild:", guild.id);
    return;
  }

  if (!serverQueue.connection) {
    console.warn("⚠️ | No voice connection found");
    queue.delete(guild.id);
    return;
  }

  // Pulisco eventuale timeout di disconnessione
  if (serverQueue.disconnectTimeout) {
    clearTimeout(serverQueue.disconnectTimeout);
    serverQueue.disconnectTimeout = null;
  }

  // Se non ci sono più canzoni
  if (!song) {
    console.log("📭 | Queue empty, scheduling disconnect");
    await updateMessageWithDisabledButtons(serverQueue);
    cleanupFFmpeg(serverQueue);
    scheduleDisconnect(guild, queue, serverQueue);
    return;
  }

  try {
    let resource;
    
    // Kill ffmpeg precedente se esiste
    cleanupFFmpeg(serverQueue);

    // File locale
    if (!song.url && song.localPath) {
      console.log(`🎵 | Playing local file: ${song.title}`);
      
      const args = [];
      if (seekSeconds > 0) args.push("-ss", `${seekSeconds}`);
      args.push(
        "-i", song.localPath,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1"
      );

      serverQueue.ffmpegProcess = spawn("ffmpeg", args);
      
      serverQueue.ffmpegProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (!msg.includes("frame=") && !msg.includes("size=")) {
          console.log(`ffmpeg: ${msg}`);
        }
      });
      
      serverQueue.ffmpegProcess.on("error", (err) => {
        console.error("❌ | FFmpeg error:", err);
        handlePlaybackError(guild, queue, serverQueue);
      });
      
      serverQueue.ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`⚠️ | FFmpeg closed with code: ${code}`);
        }
      });

      resource = createAudioResource(serverQueue.ffmpegProcess.stdout, { 
        inputType: StreamType.Raw 
      });
    }
    // ARCHIVE.ORG o URL DIRETTO
    else if (song.sourceFrom === 'archive' || (song.url && song.url.includes('archive.org'))) {
      console.log(`📚 | Playing Archive.org: ${song.title}`);
      
      const args = [];
      if (seekSeconds > 0) args.push("-ss", `${seekSeconds}`);
      
      args.push(
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", song.url,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "-vn",
        "pipe:1"
      );

      serverQueue.ffmpegProcess = spawn("ffmpeg", args);
      
      serverQueue.ffmpegProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (!msg.includes("frame=") && !msg.includes("size=") && !msg.includes("time=")) {
          console.log(`ffmpeg: ${msg}`);
        }
      });
      
      serverQueue.ffmpegProcess.on("error", (err) => {
        console.error("❌ | FFmpeg error:", err);
        handlePlaybackError(guild, queue, serverQueue);
      });
      
      serverQueue.ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`⚠️ | FFmpeg closed with code: ${code}`);
        }
      });

      resource = createAudioResource(serverQueue.ffmpegProcess.stdout, { 
        inputType: StreamType.Raw 
      });
    }
    else if (song.sourceFrom === 'bitchute') {
      console.log(`🎵 | Playing Bitchute: ${song.title}`);
      
      const ytdlpProcess = spawn("yt-dlp", [
        "--no-check-certificate",
        "--no-warnings",
        "--geo-bypass",
        "-f", "best",
        "-g",
        song.url
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let directUrl = "";
      
      ytdlpProcess.stdout.on("data", (data) => {
        directUrl += data.toString().trim();
      });

      ytdlpProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (msg.includes("ERROR")) {
          console.error(`yt-dlp error: ${msg}`);
        }
      });

      ytdlpProcess.on("close", (code) => {
        if (code !== 0 || !directUrl) {
          console.error("❌ | Failed to extract Bitchute URL");
          handlePlaybackError(guild, queue, serverQueue);
          return;
        }

        console.log(`🎯 | Got direct URL: ${directUrl.substring(0, 50)}...`);

        const args = [];
        if (seekSeconds > 0) args.push("-ss", `${seekSeconds}`);
        
        args.push(
          "-reconnect", "1",
          "-reconnect_streamed", "1",
          "-reconnect_delay_max", "5",
          "-user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "-i", directUrl,
          "-f", "s16le",
          "-ar", "48000",
          "-ac", "2",
          "-vn",
          "pipe:1"
        );

        serverQueue.ffmpegProcess = spawn("ffmpeg", args);
        
        serverQueue.ffmpegProcess.stderr.on("data", (data) => {
          const msg = data.toString();
          if (!msg.includes("frame=") && !msg.includes("size=") && !msg.includes("time=")) {
            console.log(`ffmpeg: ${msg}`);
          }
        });
        
        serverQueue.ffmpegProcess.on("error", (err) => {
          console.error("❌ | FFmpeg error:", err);
          handlePlaybackError(guild, queue, serverQueue);
        });
        
        serverQueue.ffmpegProcess.on("close", (code) => {
          if (code !== 0 && code !== null) {
            console.warn(`⚠️ | FFmpeg closed with code: ${code}`);
          }
        });

        const resource = createAudioResource(serverQueue.ffmpegProcess.stdout, { 
          inputType: StreamType.Raw 
        });

        serverQueue.player.removeAllListeners(AudioPlayerStatus.Idle);
        serverQueue.player.removeAllListeners("error");

        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);
        
        serverQueue.reproduction = {
          startTimestamp: Date.now(),
          playedTime: seekSeconds,
          isPaused: false
        };

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
          console.log("✅ | Song finished, moving to next");
          
          cleanupFFmpeg(serverQueue);
          
          const currentQueue = queue.get(guild.id);
          if (!currentQueue) {
            console.warn("⚠️ | Queue no longer exists");
            return;
          }

          currentQueue.songs.shift();

          if (currentQueue.songs.length > 0) {
            console.log(`▶️ | Playing next song: ${currentQueue.songs[0].title}`);
            currentQueue.reproduction = { 
              startTimestamp: Date.now(), 
              playedTime: 0, 
              isPaused: false 
            };
            playSong(guild, currentQueue.songs[0], queue);
          } else {
            console.log("📭 | No more songs in queue");
            updateMessageWithDisabledButtons(currentQueue).catch(console.error);
            scheduleDisconnect(guild, queue, currentQueue);
          }
        });

        serverQueue.player.on("error", (error) => {
          if (error.message && 
              (error.message.includes("Premature close") || 
              error.message.includes("EPIPE"))) {
            console.warn("⚠️ | Ignored benign player error:", error.message);
            return;
          }

          console.error("❌ | Player error:", error.message);
          handlePlaybackError(guild, queue, serverQueue);
        });
      });

      ytdlpProcess.on("error", (err) => {
        console.error("❌ | yt-dlp process error:", err);
        handlePlaybackError(guild, queue, serverQueue);
      });

      return;
    }
    // YOUTUBE
    else {
      console.log(`🎵 | Playing YouTube: ${song.title}`);
      
      const ytProcess = spawn("yt-dlp", [
        "-f", "bestaudio",
        "-o", "-",
        song.url
      ], { stdio: ["ignore", "pipe", "pipe"] });

      serverQueue.ffmpegProcess = spawn("ffmpeg", [
        "-ss", `${seekSeconds}`,
        "-i", "pipe:0",
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1"
      ], { stdio: ["pipe", "pipe", "pipe"] });

      // Gestione errori pipe
      ytProcess.stdout.on("error", (err) => {
        if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
          console.error("❌ | yt-dlp stdout error:", err);
        }
      });

      serverQueue.ffmpegProcess.stdin.on("error", (err) => {
        if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
          console.error("❌ | ffmpeg stdin error:", err);
        }
      });

      ytProcess.stdout.pipe(serverQueue.ffmpegProcess.stdin);

      ytProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (msg.includes("ERROR") || msg.includes("WARNING")) {
          console.log(`yt-dlp: ${msg}`);
        }
      });

      serverQueue.ffmpegProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (!msg.includes("frame=") && !msg.includes("size=")) {
          console.log(`ffmpeg: ${msg}`);
        }
      });

      ytProcess.on("error", (err) => {
        console.error("❌ | yt-dlp error:", err);
        handlePlaybackError(guild, queue, serverQueue);
      });

      serverQueue.ffmpegProcess.on("error", (err) => {
        console.error("❌ | FFmpeg error:", err);
        handlePlaybackError(guild, queue, serverQueue);
      });

      resource = createAudioResource(serverQueue.ffmpegProcess.stdout, { 
        inputType: StreamType.Raw 
      });
    }

    // Rimuovo i listener precedenti per evitare memory leaks
    serverQueue.player.removeAllListeners(AudioPlayerStatus.Idle);
    serverQueue.player.removeAllListeners("error");

    serverQueue.player.play(resource);
    serverQueue.connection.subscribe(serverQueue.player);
    
    serverQueue.reproduction = {
      startTimestamp: Date.now(),
      playedTime: seekSeconds,
      isPaused: false
    };

    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
      console.log("✅ | Song finished, moving to next");
      
      cleanupFFmpeg(serverQueue);
      
      const currentQueue = queue.get(guild.id);
      if (!currentQueue) {
        console.warn("⚠️ | Queue no longer exists");
        return;
      }

      currentQueue.songs.shift();

      if (currentQueue.songs.length > 0) {
        console.log(`▶️ | Playing next song: ${currentQueue.songs[0].title}`);
        currentQueue.reproduction = { 
          startTimestamp: Date.now(), 
          playedTime: 0, 
          isPaused: false 
        };
        playSong(guild, currentQueue.songs[0], queue);
      } else {
        console.log("📭 | No more songs in queue");
        updateMessageWithDisabledButtons(currentQueue).catch(console.error);
        scheduleDisconnect(guild, queue, currentQueue);
      }
    });

    // Gestione errori del player
    serverQueue.player.on("error", (error) => {
      if (error.message && 
          (error.message.includes("Premature close") || 
           error.message.includes("EPIPE"))) {
        console.warn("⚠️ | Ignored benign player error:", error.message);
        return;
      }

      console.error("❌ | Player error:", error.message);
      handlePlaybackError(guild, queue, serverQueue);
    });

  } catch (error) {
    if (error.message && 
        (error.message.includes("Premature close") || 
         error.message.includes("EPIPE"))) {
      console.warn("⚠️ | Ignored benign catch error:", error.message);
      return;
    }

    console.error("❌ | Catch block error while playing:", error);
    handlePlaybackError(guild, queue, serverQueue);
  }
}

function handlePlaybackError(guild, queue, serverQueue) {
  cleanupFFmpeg(serverQueue);
  
  const currentQueue = queue.get(guild.id);
  if (!currentQueue) {
    console.warn("⚠️ | Queue no longer exists during error handling");
    return;
  }

  currentQueue.songs.shift();

  if (currentQueue.songs.length > 0) {
    console.log("⏭️ | Skipping to next song after error");
    playSong(guild, currentQueue.songs[0], queue);
  } else {
    console.log("❌ | Queue empty after error, cleaning up");
    updateMessageWithDisabledButtons(currentQueue).catch(console.error);
    
    if (currentQueue.connection && !currentQueue.connection.destroyed) {
      try {
        currentQueue.connection.destroy();
      } catch (err) {
        console.warn("⚠️ | Error destroying connection:", err.message);
      }
    }
    
    queue.delete(guild.id);
  }
}