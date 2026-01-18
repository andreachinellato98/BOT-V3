import { AudioPlayerStatus as SkipAudioPlayerStatus } from "@discordjs/voice";
import playSongSkip from "../playSong.js";

export default {
  name: "skip",
  description: "Salta la canzone attuale",
  async execute(interaction, queue, fromButton = false) {
    
    if (!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Skipping...");
    }

    const serverQueue = queue.get(interaction.guild.id);

    const respond = (content) => {
      if (fromButton) {
        return;
      } else {
        return interaction.editReply(content);
      }
    };

    if (!serverQueue || !serverQueue.songs.length) {
      return respond("❌ | No song to skip.");
    }

    serverQueue.songs.shift();

    // Fermo il player
    if (serverQueue.songs.length === 0) {
      if (serverQueue.player) {
        serverQueue.player.removeAllListeners(SkipAudioPlayerStatus.Idle);
        serverQueue.player.stop();
      }
      return respond("⏭️ | Queue is empty. Waiting for new songs.");
    }

    // Vai con la prossima canzone
    await playSongSkip(interaction.guild, serverQueue.songs[0], queue, true);

    return respond(`⏭️ | Skipped. Now playing: **${serverQueue.songs[0].title}**\nLink: **${serverQueue.songs[0].url}**`);
  },
}