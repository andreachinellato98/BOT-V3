import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";

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

export async function sendNowPlayingEmbed(interaction, song, serverQueue) {
  const isBitchute = song.sourceFrom === 'bitchute';
  
  const embed = new EmbedBuilder()
    .setColor("#2A8AF7")
    .setTitle("🎵 | Current playback")
    .setDescription(song.url ? `**[${song.title}](${song.url})**` : `**${song.title}**`)
    .setThumbnail(song.thumbnail || null)
    .addFields(
      { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Duration", value: formatTime(song.lengthSeconds), inline: true },
      { name: "Source", value: fromSource(song.sourceFrom), inline: true }
    )
    .setTimestamp();

  if (isBitchute) {
    embed.setFooter({ text: "⚠️ Seek and time features are unavailable for Bitchute videos." });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rewind_30s").setEmoji("⏪").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute),
    new ButtonBuilder().setCustomId("pauseplay").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("forward_30s").setEmoji("⏩").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("time").setEmoji("⏳").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute),
    new ButtonBuilder().setCustomId("stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

async function updateNowPlayingEmbed(interaction, serverQueue, feedbackMessage = null) {
  if (!serverQueue?.songs?.length) return;

  const currentSong = serverQueue.songs[0];
  const isBitchute = currentSong.sourceFrom === 'bitchute';

  const embed = new EmbedBuilder()
    .setColor("#2A8AF7")
    .setTitle("🎵 | Current playback")
    .setDescription(currentSong.url ? `**[${currentSong.title}](${currentSong.url})**` : `**${currentSong.title}**`)
    .setThumbnail(currentSong.thumbnail || null)
    .addFields(
      { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Duration", value: formatTime(currentSong.lengthSeconds), inline: true },
      { name: "Source", value: fromSource(currentSong.sourceFrom), inline: true }
    )
    .setTimestamp();

  if (isBitchute) {
    embed.setFooter({ text: "⚠️ Seek and time features are unavailable for Bitchute videos." });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rewind_30s").setEmoji("⏪").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute),
    new ButtonBuilder().setCustomId("pauseplay").setEmoji(serverQueue.reproduction.isPaused ? "▶️" : "⏸️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("forward_30s").setEmoji("⏩").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("time").setEmoji("⏳").setStyle(ButtonStyle.Secondary).setDisabled(isBitchute),
    new ButtonBuilder().setCustomId("stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );

  // Verifica che l'interazione sia stata deferred o replied
  if (!interaction.deferred && !interaction.replied) {
    console.warn("⚠️ | Attempting to edit reply on non-deferred interaction");
    return;
  }

  try {
    await interaction.editReply({
      content: feedbackMessage || null,
      embeds: [embed],
      components: [row1, row2]
    });
  } catch (error) {
    console.error("❌ | Failed to update embed:", error.message);
  }
}

export async function handleMusicButton(interaction, queue) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch (err) {
    console.error("❌ | Button defer failed:", err.message);
    return;
  }

  const serverQueue = queue.get(interaction.guild.id);
  if (!serverQueue) {
    return interaction.followUp({ content: "❌ | No queue" }).catch(() => {});
  }

  if (serverQueue.connection?.destroyed) {
    return interaction.followUp({ content: "❌ | Disconnected"}).catch(() => {});
  }

  const isIdle = serverQueue.player.state.status === AudioPlayerStatus.Idle;
  if (isIdle && !["stop"].includes(interaction.customId)) {
    return interaction.followUp({ content: "❌ | Player idle" }).catch(() => {});
  }

  const currentSong = serverQueue.songs[0];
  const isBitchute = currentSong?.sourceFrom === 'bitchute';

  // Blocco operazioni per Bitchute perché gli stronzi non danno la durata della canzone
  if (isBitchute && ["rewind_30s", "forward_30s", "time"].includes(interaction.customId)) {
    return interaction.followUp({ 
      content: "⚠️ | This feature is unavailable for Bitchute videos (no duration information)"
    }).catch(() => {});
  }

  try {
    switch (interaction.customId) {
      case "rewind_30s": {
        const cmd = interaction.client.commands.get("seek");
        if (!cmd) return interaction.followUp({ content: "❌ | Seek not found", ephemeral: true });
        await cmd.execute(interaction, queue, -30, true);
        const uq = queue.get(interaction.guild.id);
        if (uq?.songs?.length) await updateNowPlayingEmbed(interaction, uq, "⏪ | -30s");
        break;
      }
      case "pauseplay": {
        const cmdName = serverQueue.reproduction.isPaused ? "resume" : "pause";
        const cmd = interaction.client.commands.get(cmdName);
        if (!cmd) return interaction.followUp({ content: `❌ | ${cmdName} not found`, ephemeral: true });
        await cmd.execute(interaction, queue, true);
        const uq = queue.get(interaction.guild.id);
        if (uq?.songs?.length) {
          const message = cmdName === "resume" ? "▶️ | Resumed" : "⏸️ | Paused";
          await updateNowPlayingEmbed(interaction, uq, message);
        }
        break;
      }
      case "stop": {
        const cmd = interaction.client.commands.get("stop");
        if (!cmd) return interaction.followUp({ content: "❌ | Stop not found", ephemeral: true });
        await cmd.execute(interaction, queue, true);
        await interaction.editReply({ content: "⏹️ | Stopped", embeds: [], components: [] }).catch(() => {});
        break;
      }
      case "forward_30s": {
        const cmd = interaction.client.commands.get("seek");
        if (!cmd) return interaction.followUp({ content: "❌ | Seek not found", ephemeral: true });
        await cmd.execute(interaction, queue, 30, true);
        const uq = queue.get(interaction.guild.id);
        if (uq?.songs?.length) await updateNowPlayingEmbed(interaction, uq, "⏩ | +30s");
        break;
      }
      case "skip": {
        const cmd = interaction.client.commands.get("skip");
        if (!cmd) return interaction.followUp({ content: "❌ | Skip not found", ephemeral: true });
        await cmd.execute(interaction, queue, true);
        const uq = queue.get(interaction.guild.id);
        if (uq?.songs?.length) {
          await updateNowPlayingEmbed(interaction, uq, "⏭️ | Skipped");
        } else {
          await interaction.editReply({ content: "⏭️ | Queue empty", embeds: [], components: [] }).catch(() => {});
        }
        break;
      }
      case "time": {
        const cmd = interaction.client.commands.get("time");
        if (!cmd) return interaction.followUp({ content: "❌ | Time not found", ephemeral: true });
        const timeMsg = await cmd.execute(interaction, queue, true);
        const uq = queue.get(interaction.guild.id);
        if (uq?.songs?.length) await updateNowPlayingEmbed(interaction, uq, timeMsg);
        break;
      }
      default:
        return interaction.followUp({ content: "❌ | Unknown button", ephemeral: true });
    }
  } catch (err) {
    console.error("❌ | Button error:", err);
    interaction.followUp({ content: "❌ | Error", ephemeral: true }).catch(() => {});
  }
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}