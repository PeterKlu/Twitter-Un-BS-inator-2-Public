const { REST, Routes, Client, GatewayIntentBits, Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const client = new Client({ intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildEmojisAndStickers,
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
const SPACES_LINK_SEGMENT = '/i/spaces';
const TWITTER_LINK_REGEX = /https:\/\/twitter\.com\//;
const X_LINK_REGEX = /https:\/\/x\.com\//;
const FULL_MODIFIED_LINK_REGEX = /(https:\/\/fxtwitter\.com\/\S+\/\d+)|(\|\|\s*https:\/\/fxtwitter\.com\/\S+\/\d+(\?s=+\d+\s*)*\|\|)/gm;
const TWITTER_LINK_WITH_SPOILER_REGEX = /\|\|\s*https:\/\/twitter\.com\/.*\|\|/
const X_LINK_WITH_SPOILER_REGEX = /\|\|\s*https:\/\/x\.com\/.*\|\|/
const FULL_MODIFIED_SPOILERED_LINK_REGEX = /(\|\|\s*https:\/\/fxtwitter\.com\/\S+\/\d+(\?s=+\d+\s*)*\|\|)/

const PIXIV_LINK = 'https://www.pixiv.net/';
const PHIXIV_LINK = 'https://www.phixiv.net/';
const PIXIV_LINK_REGEX = /https:\/\/www.pixiv\.net\//;
const PIXIV_LINK_WITH_SPOILER_REGEX = /\|\|\s*https:\/\/pixiv\.net.*\|\|/
const FULL_MODIFIED_PIXIV_LINK_REGEX = /(https:\/\/www.phixiv\.net\/\S+\/\d+)|(\|\|\s*https:\/\/www.phixiv\.net\/\S+\/\d+\|\|)/gm;

/** A list of strings that represent whitelisted IDs */
var whitelistedUsers = [];
/** A list of strings that represent the IDs of misbehaving server members */
var misbehavingUsers = [];

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
    const isMisbehavingUser = misbehavingUsers.includes(message.author.id);
    const isTwitterLink = TWITTER_LINK_REGEX.test(message.content);
    const isXLink = X_LINK_REGEX.test(message.content);
    const isPixivLink = PIXIV_LINK_REGEX.test(message.content);
    if (isTwitterLink || isXLink) {
        handleTwitterLinkMessage(message, isTwitterLink, isMisbehavingUser);
    } else if (isPixivLink) {
        handlePixivLinkMessage(message, isMisbehavingUser);
    } else if (isMisbehavingUser && message.attachments.size > 0) {
        handleMisbehavingUserMessage(message);
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
    await updateWhitelist(interaction).then(() => {
        whitelistedUsers = returnStringifiedListFromJSONFile(WHITELIST_FILE_PATH);
    });
});

function handleTwitterLinkMessage(message, isTwitterLink, isMisbehavingUser) {
    const BASE_LINK = isTwitterLink ? TWITTER_LINK : X_LINK;
    var messageContent = message.content;
    while (messageContent.includes(BASE_LINK)) {
         messageContent = messageContent.replace(BASE_LINK, EMBEDDED_TWITTER_LINK);
    }
    messageContent
        .match(FULL_MODIFIED_LINK_REGEX)
        ?.forEach(messageContentMatch => {
            message.suppressEmbeds()
                   .then(() => {
                        if (isMisbehavingUser) {
                            messageContentMatch = '||' + messageContentMatch + '||';
                        }
                        message.reply({ content: messageContentMatch, allowedMentions: { repliedUser: false } })
                               .catch((error) => console.log(error.message));
            });
            message.suppressEmbeds();
        });
}

function handlePixivLinkMessage(message, isMisbehavingUser) {
    var messageContent = message.content;
    var hasSpoiler = PIXIV_LINK_WITH_SPOILER_REGEX.test(messageContent);
    while (messageContent.includes(PIXIV_LINK)) {
         messageContent = messageContent.replace(PIXIV_LINK, PHIXIV_LINK);
    }
    messageContent
        .match(FULL_MODIFIED_PIXIV_LINK_REGEX)
        ?.forEach(messageContentMatch => {
            message.suppressEmbeds()
                   .then(() => {
                        if (hasSpoiler || isMisbehavingUser) {
                            messageContentMatch = '||' + messageContentMatch + '||';
                        }
                        message.reply({ content: messageContentMatch, allowedMentions: { repliedUser: false } })
                               .catch((error) => console.log(error.message));
            });
            // To ensure that we still suppress the embed even if the first request gets denied
            message.suppressEmbeds();
        });
}

function handleMisbehavingUserMessage(message) {
    var response = message.author.username + ' 💬: ' + message.content + ' \n';
    var matchCount = 0;
    message.attachments
        ?.forEach(attachment => {
            response = response + '||' + attachment.url + '|| \n';
            matchCount++;
        });
    message.reply({ content: response, allowedMentions: { repliedUser: false } })
        .catch((error) => console.log(error.message));
    const baseTimeoutMs = 300;
    var timeoutMs = (baseTimeoutMs - (baseTimeoutMs / matchCount)) * matchCount;
    setTimeout(() => message.delete(), matchCount > 1 ? timeoutMs : baseTimeoutMs);
}

async function updateWhitelist(interaction) {
    if (interaction.commandName === BLACKLIST_CMD && !misbehavingUsers.includes(interaction.user.id)) {
        await blacklist(whitelistedUsers, fs, interaction, WHITELIST_FILE_PATH);
    } else if (interaction.commandName === WHITELIST_CMD) {
        await whitelist(whitelistedUsers, fs, interaction, WHITELIST_FILE_PATH);
    }    
}

function returnStringifiedListFromJSONFile(fileName) {
    return JSON.parse(fs.readFileSync(fileName)).flatMap(val => val);
}
