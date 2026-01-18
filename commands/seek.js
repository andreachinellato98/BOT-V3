import { AudioPlayerStatus } from "@discordjs/voice";
import playSong from "../playSong.js";

export default {
  name: "seek",
  description: "Seek to a specific time in the song",
  async execute(interaction, queue, amount = null, fromButton = false) {
    
    // Reply istantanea solo se non viene da bottone
    if (!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Seeking...");
    }

    const serverQueue = queue.get(interaction.guild.id);

    // Helper per rispondere
    const respond = (content) => {
      if (fromButton) {
        return;
      } else {
        return interaction.editReply(content);
      }
    };

    if (!serverQueue || !serverQueue.songs.length) {
      return respond("❌ | No song playing.");
    }

    let totalSeconds;
    let timeString;

    // Se viene da bottone (amount è un numero positivo o negativo)
    if (amount !== null) {
      totalSeconds = Math.max(0, (serverQueue.reproduction.playedTime ?? 0) + amount);
      timeString = amount > 0 ? `+${amount}s` : `${amount}s`;
    } 
    // Se viene da comando slash
    else {
      const ore = interaction.options.getInteger("h") || 0;
      const minuti = interaction.options.getInteger("m") || 0;
      const secondi = interaction.options.getInteger("s") || 0;

      totalSeconds = ore * 3600 + minuti * 60 + secondi;

      if (totalSeconds === 0) {
        return respond("❌ | Please provide a valid time to seek to.");
      }

      // Formatta il messaggio
      const timeParts = [];
      if (ore > 0) timeParts.push(`${ore}h`);
      if (minuti > 0) timeParts.push(`${minuti}m`);
      if (secondi > 0) timeParts.push(`${secondi}s`);
      timeString = timeParts.length ? timeParts.join(" ") : `${totalSeconds}s`;
    }

    const song = serverQueue.songs[0];

    // Controlla se seek backwards (solo per comando, non per bottoni)
    if (amount === null && serverQueue.reproduction.playedTime && totalSeconds < serverQueue.reproduction.playedTime) {
      return respond("❌ | Cannot seek backwards.");
    }

    if (!song || totalSeconds >= song.lengthSeconds) {
      return respond("❌ | Seek time exceeds song length.");
    }

    try {
      // Stop current player senza rimuovere la canzone
      serverQueue.player.removeAllListeners(AudioPlayerStatus.Idle);
      serverQueue.player.stop(true);

      // Kill vecchio ffmpeg se esiste
      if (serverQueue.ffmpegProcess) {
        try {
          serverQueue.ffmpegProcess.kill("SIGKILL");
        } catch (err) {
          console.warn("⚠️ | Error killing ffmpeg on seek:", err);
        }
        serverQueue.ffmpegProcess = null;
      }

      // PlaySong con seek
      await playSong(interaction.guild, song, queue, true, totalSeconds);

      await respond(`⏩ | Seeked to **${timeString}**`);
    } catch (error) {
      console.error("❌ | Error during seek:", error);
      await respond("❌ | Error while seeking in song.");
    }
  }
}