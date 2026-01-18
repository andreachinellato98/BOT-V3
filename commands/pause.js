export default {
  name: 'pause',
  description: 'Pause reproduction',
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

    if (!serverQueue) {
      return respond('❌ | No song to pause.');
    }

    serverQueue.player.pause();

    // Salvataggio e formattazione del momento in cui viene messo in pausa
    const now = Date.now();
    if (serverQueue.reproduction && !serverQueue.reproduction.isPaused) {
      serverQueue.reproduction.playedTime += (now - serverQueue.reproduction.startTimestamp) / 1000;
      serverQueue.reproduction.isPaused = true;
    }

    return respond('⏸️ | Paused.');
  }
};