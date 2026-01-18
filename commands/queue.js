export default {
  name: 'queue',
  description: 'Mostra le canzoni attualmente in coda',

  async execute(interaction, queue, fromButton = false) {
    
    if(!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Processing...");
    }

    const serverQueue = queue.get(interaction.guildId);

    const respond = (content) => {
      if (fromButton) {
        return;
      } else {
        return interaction.editReply(content);
      }
    };

    if (!serverQueue || serverQueue.songs.length === 0) {
      return respond('⚠️ | Queue is empty.');
    }

    let response = '🎶 **| Coda attuale:**\n';
    let countSongs = 1;
    for(let song of serverQueue.songs) {
      response += `**[${countSongs}] | ${song.title}**\n`;
      countSongs++;
    }

    return respond(response);
  },
};