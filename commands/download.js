import { addDownloadToQueue } from "../utils/downloadQueue.js";

export default {
  name: "download",
  description: "Scarica un video di YouTube in formato MP4",
  async execute(interaction) {
    
    if(!interaction.deferred && !interaction.replied) {
      await interaction.reply("⏳ | Processing...");
    }

    const url = interaction.options.getString("url");

    // Validazione URL
    try {
      new URL(url);
      if (!url.includes("youtube.com") && !url.includes("youtu.be") && !url.includes("bitchute.com")) {
        return interaction.editReply("⚠️ | URL needs to be a valid Youtube/Bitchute URL.");
      }
    } catch (_) {
      return interaction.editReply("⚠️ | Not valid URL. Please provide a valid Youtube/Bitchute URL.");
    }

    await interaction.editReply("📝 | Video added to download queue. Processing...");
    
    addDownloadToQueue(url, interaction.channel, interaction.user.id);
  },
};