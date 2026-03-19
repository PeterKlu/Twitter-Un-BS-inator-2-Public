const write = require('./fileWriteAndRespond');

async function blacklist(whitelistedUsers, fs, interaction, filePath) {
    const INTERACTION_USER_ID = interaction?.member?.user?.id;
    if (whitelistedUsers.some(id => id === INTERACTION_USER_ID)) {
        whitelistedUsers = await whitelistedUsers.filter(value => value != INTERACTION_USER_ID);
        const json = JSON.stringify(whitelistedUsers, 'whitelisted-ids', 2);
        await write(fs, filePath, json, `Successfully opted out <@${INTERACTION_USER_ID}>`, interaction);
    } else {
        interaction
            .reply({ content: "You aren't among users who have opted in", ephemeral: true })
            .catch((error) => console.log(error.message));
    }
}

module.exports = blacklist;