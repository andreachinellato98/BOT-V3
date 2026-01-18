export default {
  name: 'quit',
  description: 'Quit channel and destroys queue',
  async execute(interaction, queue, fromButton = false) {
    
    if(!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Disconnecting...");
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
      return respond('❌ | Bot is not in a voice channel.');
    }

    // Leggi ffmpegProcess da serverQueue invece che da parametro
    if(serverQueue.ffmpegProcess) {
      console.log('❌ | FFmpeg in esecuzione. Chiudo il processo.');
      try {
        serverQueue.ffmpegProcess.stdin.destroy();
        serverQueue.ffmpegProcess.stdout.destroy();
        serverQueue.ffmpegProcess.stderr.destroy();
        serverQueue.ffmpegProcess.kill('SIGKILL');
      } catch (err) {
        console.warn("⚠️ | Error killing ffmpeg process:", err);
      }
      
      serverQueue.ffmpegProcess = null;
    }

    // Cancella il timeout di disconnessione se esiste
    if (serverQueue.disconnectTimeout) {
      clearTimeout(serverQueue.disconnectTimeout);
      serverQueue.disconnectTimeout = null;
    }

    // Check connessione non distrutta
    if (serverQueue.connection && !serverQueue.connection.destroyed) {
      serverQueue.connection.destroy();
      queue.delete(interaction.guild.id);
    }

    return respond('👋 | Quitting.');
  }
}