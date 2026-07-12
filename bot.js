require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

const savedChannels = new Map();

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing DISCORD_TOKEN in .env or environment variables');
}

const commands = [
  new SlashCommandBuilder()
    .setName('voice')
    .setDescription('ควบคุมบอทเข้าห้องเสียง')
    .addSubcommand(sub =>
      sub.setName('join').setDescription('ให้บอทเข้าห้องเสียง')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('ช่องเสียงที่ต้องการให้เข้า')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('leave').setDescription('ให้บอทออกจากห้องเสียง')
    )
].map(cmd => cmd.toJSON());

async function joinChannel(channel, guild) {
  const existing = getVoiceConnection(guild.id);
  if (existing) existing.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  savedChannels.set(guild.id, { channelId: channel.id, guildId: guild.id });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch {
      connection.destroy();
      const saved = savedChannels.get(guild.id);
      if (!saved) return;
      setTimeout(async () => {
        try {
          const g = client.guilds.cache.get(saved.guildId);
          if (!g) return;
          const ch = g.channels.cache.get(saved.channelId);
          if (!ch) return;
          await joinChannel(ch, g);
        } catch (err) {
          console.error('[Auto-Rejoin] failed:', err.message);
        }
      }, 3000);
    }
  });

  return connection;
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands registered');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'voice') return;

  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({ content: 'คำสั่งนี้ใช้ได้ในเซิร์ฟเวอร์เท่านั้น', ephemeral: true });
    return;
  }

  // ตอบ defer แบบ ephemeral แล้วลบทิ้ง — ไม่แสดงข้อความใดๆ
  await interaction.deferReply({ ephemeral: true });

  if (sub === 'join') {
    let channel = interaction.options.getChannel('channel');

    if (!channel) {
      try {
        const member = await guild.members.fetch(interaction.user.id);
        channel = member.voice.channel;
      } catch {
        await interaction.deleteReply();
        return;
      }
    }

    if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
      await interaction.deleteReply();
      return;
    }

    try {
      await joinChannel(channel, guild);
    } catch (err) {
      console.error('[join]', err.message);
    }
    await interaction.deleteReply();
    return;
  }

  if (sub === 'leave') {
    const connection = getVoiceConnection(guild.id);
    if (connection) {
      savedChannels.delete(guild.id); // ลบก่อน destroy เพื่อกัน auto-rejoin
      connection.destroy();
    }
    await interaction.deleteReply();
  }
});

client.login(process.env.DISCORD_TOKEN);
