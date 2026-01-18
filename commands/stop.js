export default {
  name: 'stop',
  description: 'Stop and clear queue',
  async execute(interaction, queue, fromButton = false) {
    if (fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(err => {
        console.error("❌ | Button defer failed:", err.message);
        return;
      });
    } else if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply().catch(err => {
        console.error("❌ | Command defer failed:", err.message);
        return;
      });
    }

    const serverQueue = queue.get(interaction.guild.id);

    const respond = (content) => {
      if (fromButton) {
        return interaction.editReply({ content, embeds: [], components: [] });
      }
      return interaction.editReply(content);
    };

    if (!serverQueue) {
      return respond('❌ | Nothing playing');
    }

    try {
      if (serverQueue.disconnectTimeout) clearTimeout(serverQueue.disconnectTimeout);
      if (serverQueue.ffmpegProcess) serverQueue.ffmpegProcess.kill('SIGKILL');
      
      serverQueue.player.removeAllListeners();
      serverQueue.player.stop(true);
      serverQueue.songs = [];

      await new Promise(resolve => setTimeout(resolve, 200));

      if (serverQueue.connection && !serverQueue.connection.destroyed) {
        serverQueue.connection.destroy();
      }

      await new Promise(resolve => setTimeout(resolve, 150));
      queue.delete(interaction.guild.id);
      await new Promise(resolve => setTimeout(resolve, 100));

      return respond('⏹️ | Stopped');
    } catch (err) {
      console.error("❌ | Stop error:", err);
      return respond('❌ | Error stopping');
    }
  }
};