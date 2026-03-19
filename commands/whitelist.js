const write = require('./fileWriteAndRespond');

async function whitelist(whitelistedUsers, fs, interaction, filePath) {
    const INTERACTION_USER_ID = interaction?.user?.id;
    if (!whitelistedUsers.some(id => id === INTERACTION_USER_ID)) {
        await whitelistedUsers.push(INTERACTION_USER_ID.toString());
        const json = JSON.stringify(whitelistedUsers, 'whitelisted-ids', 2);
        await write(fs, filePath, json, `Successfully opted in <@${INTERACTION_USER_ID}>`, interaction);
    } else {
        interaction
            .reply({ content: "You've already opted in", ephemeral: true })
            .catch((error) => console.log(error.message));
    }
}

module.exports = whitelist;