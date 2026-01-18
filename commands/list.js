import fs from "fs";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

export default {
  name: "list",
  description: 'Restituisce i titoli dei file: [".mp3", ".mp4", ".m4a", ".ogg", ".wav", ".flac", ".mkv", ".webm"]',
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription('Restituisce i titoli dei file: [".mp3", ".mp4", ".m4a", ".ogg", ".wav", ".flac", ".mkv", ".webm"]')
    .addStringOption(option =>
      option
        .setName("filter")
        .setDescription("Filter files by name")
        .setRequired(false)
    ),
    
  async execute(interaction) {
    
    try {
      if(!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
      
      const filtro = interaction.options.getString("filter")?.toLowerCase() ?? null;
      const localDir = process.env.LOCAL_DIR_PATH;
      
      if (!localDir) {
        return await interaction.editReply({ content: "❌ | Environment variable not defined." });
      }

      const supportedExtensions = [".mp3", ".mp4", ".m4a", ".ogg", ".wav", ".flac", ".mkv", ".webm"];
      let files = fs.readdirSync(localDir);
      let audioFiles = files.filter(file =>
        supportedExtensions.some(ext => file.toLowerCase().endsWith(ext))
      );

      if (filtro) {
        audioFiles = audioFiles.filter(file => file.toLowerCase().includes(filtro));
      }

      if (audioFiles.length === 0) {
        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("📄 | Nothing found")
          .addFields(
            { name: "Requested by", value: `<@${interaction.user.id}>`}
          )
          .setDescription(
            filtro
              ? `No file found with filter: \`${filtro}\``
              : "No file found within the folder."
          )
          .setTimestamp();
        
        return await interaction.editReply({ embeds: [embed] });
      }

      const MAX_DESCRIPTION_LENGTH = 3500;
      
      function createChunks(files) {
        const chunks = [];
        let currentChunk = [];
        let currentLength = 0;
        
        for (const file of files) {
          const fileEntry = `• ${file}\n`;
          const entryLength = fileEntry.length;
          
          if (currentLength + entryLength > MAX_DESCRIPTION_LENGTH && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [file];
            currentLength = entryLength;
          } else {
            currentChunk.push(file);
            currentLength += entryLength;
          }
        }
        
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        
        return chunks;
      }

      const chunks = createChunks(audioFiles);
      const totalChunks = chunks.length;

      const firstChunk = chunks[0];
      const firstFileList = firstChunk.map(f => `• ${f}`).join("\n");
      
      const firstEmbed = new EmbedBuilder()
        .setColor("#2A8AF7")
        .setTitle("📄 | Local Files")
        .addFields(
          { name: "Requested by", value: `<@${interaction.user.id}>`}
        )
        .setDescription(
          `Found **${audioFiles.length}** file${audioFiles.length !== 1 ? 's' : ''}` +
          (filtro ? ` with filter: \`${filtro}\`` : "") +
          (totalChunks > 1 ? ` **(Page 1/${totalChunks})**` : "") +
          `\n\`\`\`\n${firstFileList}\n\`\`\``
        )
        .setTimestamp()
        .setFooter({ 
          text: totalChunks > 1 
            ? `Showing ${firstChunk.length} of ${audioFiles.length} files (Page 1/${totalChunks})` 
            : `Total: ${audioFiles.length} file${audioFiles.length !== 1 ? 's' : ''}`
        });

      await interaction.editReply({ embeds: [firstEmbed] });

      // Invia i messaggi successivi (followUp)
      for (let i = 1; i < totalChunks; i++) {
        const chunk = chunks[i];
        const fileList = chunk.map(f => `• ${f}`).join("\n");
        
        const embed = new EmbedBuilder()
          .setColor("#2A8AF7")
          .setTitle(`📄 | Local Files (Page ${i + 1}/${totalChunks})`)
          .setDescription(`\`\`\`\n${fileList}\n\`\`\``)
          .setFooter({ 
            text: `Showing ${chunk.length} files (Page ${i + 1}/${totalChunks})`
          });

        // Piccolo delay per evitare rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        await interaction.followUp({ embeds: [embed] });
      }

    } catch (err) {
      console.error("❌ | Error during list execution:", err);
      
      try {
        const errorEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("❌ | Error")
          .addFields(
            { name: "Requested by", value: `<@${interaction.user.id}>`}
          )
          .setDescription(`An error occurred while listing files.\n\`\`\`${err.message}\`\`\``)
          .setTimestamp();
        
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          return await interaction.reply({ embeds: [errorEmbed] });
        }
      } catch (e) {
        console.error("Failed to send error:", e);
      }
    }
  }
};