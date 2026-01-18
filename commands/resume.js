export default {
  name: 'resume',
  description: 'Resume reproduction',
  async execute(interaction, queue, fromButton = false) {
    
    if(!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Processing...");
    }

    const respond = (content) => {
      if (fromButton) {
        return;
      } else {
        return interaction.editReply(content);
      }
    };

    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) { 
      return respond('❌ | No song to resume.');
    }

    serverQueue.player.unpause();

    // Segna il nuovo momento di ripresa della riproduzione
    if (serverQueue.reproduction && serverQueue.reproduction.isPaused) {
      serverQueue.reproduction.startTimestamp = Date.now();
      serverQueue.reproduction.isPaused = false;
    }

    return respond('▶️ | Resumed.');
  }
}