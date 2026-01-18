import { EmbedBuilder } from 'discord.js';

export default {
  name: 'help',
  description: 'Mostra la lista di comandi disponibili',
  execute(interaction) {
    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🎵 | BOT V3 - Help')
      .setDescription('Comandi disponibili:')
      .addFields(
        { name: '▶️ | /play <stringa o URL> <local>', value: 'Cerca una canzone e avvia la riproduzione o la aggiunge alla coda. Se "local" viene valorizzato a "True", vengono riprodotti gli audio locali' },
        { name: '⏹️ | /stop', value: 'Ferma la riproduzione e svuota la coda restando nel canale vocale' },
        { name: '⏸️ | /pause', value: 'Mette in pausa la riproduzione attuale' },
        { name: '▶️ | /resume', value: 'Riprende la riproduzione messa in pausa' },
        { name: '⏭️ | /skip', value: 'Salta alla prossima canzone nella coda' },
        { name: '⏩ | /seek h:<ore> m:<minuti> s:<secondi>', value: 'Sposta la riproduzione al tempo specificato' },
        { name: '⏱️ | /time', value: 'Indica il momento esatto a cui è arrivata la riproduzione del file audio'},
        { name: 'ℹ️ | /info', value: 'Se presente, mostra la traccia audio in riproduzione' },
        { name: '📝 | /queue', value: 'Mostra i file audio attualmente in coda'},
        { name: '📋 | /list <filter>', value: 'Restituisce un file txt contenente tutti i titoli delle tracce audio con le seguenti estensioni [".mp3", ".mp4", ".m4a", ".ogg", ".wav", ".flac", ".mkv", ".webm"]. Usare "filter" per restringere la ricerca' },
        { name: '🗑️ | /remove <number>', value: 'Rimuove una canzone dalla coda corrispondente al numero indicato'},
        { name: '🚪 | /quit', value: 'Esce dal canale vocale e pulisce la coda' },
        { name: '⬇️ | /download <URL>', value: 'Scarica un video e lo salva in una cartella. (Comando interno)' }
      )
      .setFooter({ text: '\n**Il bot rimane nel canale vocale anche quando la coda è vuota per 15 minuti, poi si disconnette automaticamente**' });

    interaction.reply({ embeds: [helpEmbed] });
  }
};