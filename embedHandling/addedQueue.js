import {
    EmbedBuilder
} from "discord.js";

export async function sendAddedQueue(interaction, song, serverQueue) {
  const embed = new EmbedBuilder()
    .setColor("#2A8AF7")
    .setTitle(`🎶 | **Added to queue**`)
    .setDescription(
      song.url
        ? `**[${song.title}](${song.url})**`
        : `**${song.title}**`
    )
    .setThumbnail(song.thumbnail || null)
    .addFields(
      { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Duration", value: `${formatTime(song.lengthSeconds)}`, inline: true },
      { name: "Source", value: fromSource(song.sourceFrom), inline: true }
    )
    .setTimestamp();

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        embeds: [embed]
      });
    } else {
      await interaction.reply({
        embeds: [embed]
      });
    }
  } catch (err) {
    console.error("❌ | Failed to send added queue message:", err.message);
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const fromSource = (from) => {
  switch (from) {
    case 'youtube': return 'youtube.com';
    case 'soundcloud': return 'soundcloud.com';
    case 'spotify': return 'spotify.com';
    case 'local': return 'Local File';
    case 'archive': return 'archive.org';
    case 'bitchute': return 'bitchute.com';
    default: return 'Unknown';
  }
}