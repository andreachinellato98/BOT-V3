export default {
  name: "info",
  description: "Mostra la canzone attualmente in riproduzione",
  async execute(interaction, queue, fromButton = false) {

    if(!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Processing...");
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
      return respond("⚠️ | No file audio playing.");
    }

    const currentSong = serverQueue.songs[0];
    return respond(`🎧 | Current playback: **${currentSong.title}**`);
  },
};