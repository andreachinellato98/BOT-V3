import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const { handleMusicButton } = await import("./embedHandling/handleMusicButton.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
const queue = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica comandi
const loadCommands = async () => {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = await fs.readdir(commandsPath);
  for (const file of commandFiles) {
    if (file.endsWith('.js')) {
      const { default: command } = await import(path.join(commandsPath, file));
      if (command.name) {
        client.commands.set(command.name, command);
        console.log(`✅ | Loaded: ${command.name}`);
      }
    }
  }
};

// Registra comandi
const registerCommands = async () => {
  const commandOptions = {
    play: [
      { name: 'input', description: 'URL or search query', type: 3, required: true },
      { name: 'local', description: 'Play a local file', type: 5, required: false },
      //{ name: 'archive', description: 'Search on Archive.org', type: 5, required: false }
    ],
    seek: [
      { name: 'h', description: 'Hours', type: 4, required: false },
      { name: 'm', description: 'Minutes', type: 4, required: false },
      { name: 's', description: 'Seconds', type: 4, required: false }
    ],
    download: [
      { name: 'url', description: 'URL to download', type: 3, required: true }
    ],
    remove: [
      { name: 'number', description: 'Song number to remove', type: 4, required: true }
    ],
    list: [
      { name: 'filter', description: 'Search filter', type: 3, required: false }
    ],
  };

  const commands = client.commands.map(({ name, description }) => ({
    name,
    description,
    options: commandOptions[name] || []
  }));

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ | Commands registered');
};

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    handleMusicButton(interaction, queue).catch(console.error);
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    console.log(`➡️ | Command: ${interaction.commandName} by ${interaction.user.tag}`);

    if (!command) {
      await interaction.reply('❌ | Unknown command').catch(() => {});
      return;
    }

    command.execute(interaction, queue).catch(console.error);
  }
});

client.once('ready', async () => {
  console.log(`✅ | ${client.user.tag} online`);
  await registerCommands();
});

process.on('SIGINT', async () => {
  console.log('🛑 | Shutting down...');
  for (const [_, sq] of queue.entries()) {
    if (sq.ffmpegProcess) sq.ffmpegProcess.kill('SIGKILL');
    if (sq.connection) sq.connection.destroy();
    if (sq.disconnectTimeout) clearTimeout(sq.disconnectTimeout);
  }
  queue.clear();
  await client.destroy();
  process.exit(0);
});

(async () => {
  await loadCommands();
  await client.login(process.env.TOKEN);
})();