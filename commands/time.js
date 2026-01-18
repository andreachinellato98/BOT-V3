export default {
  name: 'time',
  description: 'Mostra il tempo attuale della riproduzione',
  async execute(interaction, queue, fromButton = false) {
    
    // Reply istantanea solo se non viene da bottone
    if (!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Checking...");
    }

    const serverQueue = queue.get(interaction.guild.id);

    const respond = (content) => {
      if (fromButton) {
        return content;
      } else {
        return interaction.editReply(content);
      }
    };

    if (!serverQueue || !serverQueue.songs.length) {
      const msg = respond("⚠️ | No file audio playing.");
      if (fromButton) return msg;
      return;
    }

    const { reproduction } = serverQueue;

    if (!reproduction) {
      const msg = respond("ℹ️ | Playback info not available.");
      if (fromButton) return msg;
      return;
    }

    const currentSong = serverQueue.songs[0];

    if (!currentSong) {
      const msg = respond("⚠️ | No song in queue.");
      if (fromButton) return msg;
      return;
    }

    // Calcola il tempo attuale
    let secondsPlayed = reproduction.isPaused
      ? reproduction.playedTime
      : reproduction.playedTime + (Date.now() - reproduction.startTimestamp) / 1000;

    // IMPORTANTE: Limita il tempo alla durata della canzone
    const totalLength = currentSong.lengthSeconds || 0;
    if (totalLength > 0) {
      secondsPlayed = Math.min(secondsPlayed, totalLength);
    }

    // Formatta il tempo corrente
    const h = Math.floor(secondsPlayed / 3600);
    const m = Math.floor((secondsPlayed % 3600) / 60);
    const s = Math.floor(secondsPlayed % 60);

    // Formatta la durata totale
    const hSong = Math.floor(totalLength / 3600);
    const mSong = Math.floor((totalLength % 3600) / 60);
    const sSong = Math.floor(totalLength % 60);

    const message = `⏱️ | Current reproduction time: **${h}h ${m}m ${s}s** out of **${hSong}h ${mSong}m ${sSong}s**`;

    if (fromButton) {
      return message;
    } else {
      return respond(message);
    }
  },
}