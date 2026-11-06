const { REST, Routes, Client, GatewayIntentBits, Events, EmbedBuilder, AttachmentBuilder, MessageFlagsBitField } = require('discord.js');
const fs = require('fs');
const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildMessageReactions] });

/* File Paths */
const WHITELIST_FILE_PATH = './jsons/whitelisted-ids.json';

/* Command Imports */
const config = require('./config.json');
const init = require('./commands/init');
const blacklist = require('./commands/blacklist');
const whitelist = require('./commands/whitelist');
const deleteMessage = require('./commands/deleteMessage');

/* Command Names */
const BLACKLIST_CMD = 'blacklist';
const WHITELIST_CMD = 'whitelist';

/* All Versions of Twitter Links */
const TWITTER_LINK = 'https://twitter.com/';
const X_LINK = 'https://x.com/';
const EMBEDDED_TWITTER_LINK = 'https://fxtwitter.com/';
const ENGLISH_EXTENSION = '/en';
const SPACES_LINK_SEGMENT = '/i/spaces';
const TWITTER_LINK_REGEX = /https:\/\/twitter\.com\//;
const X_LINK_REGEX = /https:\/\/x\.com\//;
const MODIFIED_TWITTER_LINK_REGEX = /https:\/\/fxtwitter\.com\/\S+\/\d+/g;
const SPOILER_REGEX = /\|\|[\s\S]+?\|\|/g;

/* All Versions of Pixiv Links */
const PIXIV_LINK = 'https://www.pixiv.net/';
const PHIXIV_LINK = 'https://www.phixiv.net/';
const PIXIV_LINK_REGEX = /https:\/\/www.pixiv\.net\//;
const FULL_MODIFIED_PIXIV_LINK_REGEX = /(https:\/\/www.phixiv\.net\/\S+\/\d+)|(\|\|\s*https:\/\/www.phixiv\.net\/\S+\/\d+\|\|)/gm;

/** A list of strings that represent whitelisted IDs */
var whitelistedUsers = [];

const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);

client.login(config.BOT_TOKEN);

client.on(Events.ClientReady, () => { 
    client.user.setStatus('online');
    init(client.application.commands, BLACKLIST_CMD, WHITELIST_CMD);
    client.user.setActivity('Fixing Twitter Links');
    console.log('Successfully started');
    whitelistedUsers = returnStringifiedListFromJSONFile(WHITELIST_FILE_PATH);
    console.log('Loaded whitelisted user IDs with ' + whitelistedUsers.length + ' IDs');
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || message.webhookId != null || !whitelistedUsers.some(value => value === message.author.id) || message.content.includes(SPACES_LINK_SEGMENT)) {
        return;
    }
    const isTwitterLink = TWITTER_LINK_REGEX.test(message.content);
    const isXLink = X_LINK_REGEX.test(message.content);
    const isPixivLink = PIXIV_LINK_REGEX.test(message.content);
    if (isTwitterLink || isXLink) {
        handleTwitterLinkMessage(message, isTwitterLink);
    } else if (isPixivLink) {
        handlePixivLinkMessage(message);
    }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.channel) {
    return;
  }
  const fetched = await message.channel.messages.fetch({ limit: 100 });
  const botReplies = fetched.filter(reply => reply.author.id === client.user.id && reply.reference?.messageId === message.id);
  for (const [, reply] of botReplies) {
    if (reply.deletable) {
        await reply.delete().catch(error => console.log(error.message));
    }
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.emoji.name === '❌') {
       await deleteMessage(reaction, user, config.APPLICATION_ID);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) {
        return;
    }
    await updateWhitelist(interaction).then(() => whitelistedUsers = returnStringifiedListFromJSONFile(WHITELIST_FILE_PATH));
});

function handleTwitterLinkMessage(message, isTwitterLink) {
    const BASE_LINK = isTwitterLink ? TWITTER_LINK : X_LINK;
    var messageContent = replaceMessageContent(message, BASE_LINK, EMBEDDED_TWITTER_LINK);
    matchAndReplyToMessage(message, messageContent, MODIFIED_TWITTER_LINK_REGEX);
}

function handlePixivLinkMessage(message) {
    matchAndReplyToMessage(
        message, 
        replaceMessageContent(message, PIXIV_LINK, PHIXIV_LINK),
        FULL_MODIFIED_PIXIV_LINK_REGEX
    );
}

function replaceMessageContent(message, replacedRegex, replacingRegex) {
    var messageContent = message.content;
    while (messageContent.includes(replacedRegex)) {
        messageContent = messageContent.replace(replacedRegex, replacingRegex);
    }
    return messageContent;
}

function matchAndReplyToMessage(message, messageContent, modifiedLinkRegex) {
    const spoilerRanges = getSpoilerRanges(messageContent);
    const addEnglish = modifiedLinkRegex == MODIFIED_TWITTER_LINK_REGEX && messageContent.endsWith(ENGLISH_EXTENSION);
    const replies = [];
    const spoileredReplies = [];
    
    message.suppressEmbeds().catch(error => console.log(error.message));

    for (const match of messageContent.matchAll(modifiedLinkRegex)) {
        let reply = match[0];
        if (addEnglish) {
            reply += ENGLISH_EXTENSION;
        }
        if (isInsideSpoiler(spoilerRanges, match.index, match.index + match[0].length)) {
            spoileredReplies.push(`||${reply}||`);
        } else {
            replies.push(reply);
        }
    }

    for (const group of [replies, spoileredReplies]) {
        if (group.length === 0) continue;
        message.reply({ content: group.join('\n'), allowedMentions: { repliedUser: false } })
               .catch(error => console.log(error.message));
    }

    setTimeout(() => {
        message.suppressEmbeds().catch(error => console.log(error.message));
    }, 3000);
}

async function updateWhitelist(interaction) {
    if (interaction.commandName === BLACKLIST_CMD) {
        await blacklist(whitelistedUsers, fs, interaction, WHITELIST_FILE_PATH);
    } else if (interaction.commandName === WHITELIST_CMD) {
        await whitelist(whitelistedUsers, fs, interaction, WHITELIST_FILE_PATH);
    }    
}

function getSpoilerRanges(content) {
    return [...content.matchAll(SPOILER_REGEX)]
        .map(m => [m.index, m.index + m[0].length]);
}

function isInsideSpoiler(ranges, start, end) {
    return ranges.some(([spoilerStart, spoilerEnd]) => start >= spoilerStart && end <= spoilerEnd);
}

function returnStringifiedListFromJSONFile(fileName) {
    return JSON.parse(fs.readFileSync(fileName)).flatMap(val => val);
}
