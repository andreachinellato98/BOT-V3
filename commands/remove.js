export default {
  name: "remove",
  description: "Rimuove una canzone dalla coda tramite indice",
  options: [
    {
      name: "number",
      description: "Numero della canzone nella coda da rimuovere (>= 2)",
      type: 4,
      required: true,
    }
  ],

  async execute(interaction, queue, fromButton = false) {

    if(!fromButton && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const respond = (content) => {
      if(fromButton) {
        return;
      }
      else {
        return interaction.editReply(content);
      }
    };

    const numero = interaction.options.getInteger('number');
    const serverQueue = queue.get(interaction.guildId);

    if (!serverQueue) {
      return respond('❌ | No queue found for this guild.');
    }

    if (serverQueue && serverQueue.songs.length < 2) {
      return respond('❌ | The queue contains too few elements to remove one.');
    }

    if (numero === 1) {
      return respond('❌ | It\'s not possible to remove a song while it is playing.');
    }

    if (serverQueue && (numero > serverQueue.songs.length)) {
      return respond('❌ | Queue is empty or \'number\' parameter does not match any song.');
    }

    const removed = serverQueue.songs.splice(numero - 1, 1);
    respond(`✅ | Removed: **${removed[0].title}**`);
  }
};
