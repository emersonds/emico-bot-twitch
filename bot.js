#!/root/.nvm/versions/node/v25.2.1/bin/node
import WebSocket from 'ws';
import os from 'os';
import fs from 'fs';
import dotenv from "dotenv";
import { URLSearchParams } from 'url';
dotenv.config()

const BOT_USER_ID = '1416350263'; // This is the User ID of the chat bot (emicobot)
const OAUTH_TOKEN = process.env.OAUTH_TOKEN; // Needs scopes user:bot, user:read:chat, user:write:chat
const CLIENT_ID = process.env.CLIENT_ID;

const DEV_CHANNEL = '49923915';
const PROD_CHANNEL = '1395627822';

const CHAT_CHANNEL_USER_ID = PROD_CHANNEL; // This is the User ID of the channel that the bot will join and listen to chat messages of (EmicoMirari)

const EVENTSUB_WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';

let COMMANDS_DICTIONARY = new Map();
COMMANDS_DICTIONARY.set("!socials", "You can find all of Emico's socials on her Carrd! https://emicomirari.carrd.co/");
COMMANDS_DICTIONARY.set("!discord", "Want to hang out and chat with Emico and the Emigos outside of the stream? Join Emico's Discord! https://discord.gg/7qUXMBQktQ");
COMMANDS_DICTIONARY.set("!contraption", "contraption");
COMMANDS_DICTIONARY.set("!lurk", "lurk");
//COMMANDS_DICTIONARY.set("!quote", "quote");


var websocketSessionID;

// Start executing the bot from here
(async () => {
    // Verify that the authentication is valid
    await getAuth();

    // Start WebSocket client and register handlers
    const websocketClient = startWebSocketClient();
})();

// WebSocket will persist the application loop until you exit the program forcefully

async function getAuth() {
    // https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
    let response = await fetch('https://id.twitch.tv/oauth2/validate', {
        method: 'GET',
        headers: {
            'Authorization': 'OAuth ' + OAUTH_TOKEN
        }
    });

    if (response.status != 200) {
        if (response.status == 401) {
            refreshOauthToken();
            getAuth();
        }
        else {
            let data = await response.json();
            console.error("Token is not valid. /oauth2/validate returned status code " + response.status);
            console.error(data);
            process.exit(1);
        }
    }

    console.log("Validated token.");

    /*
    * Call scheduleSocials() as soon as the bot is authenticated
    * so that scheduleSocials() can recursively call itself.
    * This also gives us a way to verify the OAuth token is still valid,
    * because the chat bot would not be able to send a message with an invalid token.
    */
    scheduleSocials();
}

function startWebSocketClient() {
    let websocketClient = new WebSocket(EVENTSUB_WEBSOCKET_URL);

    websocketClient.on('error', console.error);

    websocketClient.on('open', () => {
        console.log('WebSocket connection opened to ' + EVENTSUB_WEBSOCKET_URL);
    });

    websocketClient.on('message', (data) => {
        handleWebSocketMessage(JSON.parse(data.toString()));
    });

    return websocketClient;
}

function handleWebSocketMessage(data) {
    switch (data.metadata.message_type) {
        case 'session_welcome': // First message you get from the WebSocket server when connecting
            websocketSessionID = data.payload.session.id; // Register the Session ID it gives us

            // Listen to EventSub, which joins the chatroom from your bot's account
            registerEventSubListeners();
            break;
        case 'notification': // An EventSub notification has occurred, such as channel.chat.message
            switch (data.metadata.subscription_type) {
                case 'channel.chat.message':
                    // First, print the message to the program's console.
                    console.log(`MSG #${data.payload.event.broadcaster_user_login} <${data.payload.event.chatter_user_login}> ${data.payload.event.message.text}`);

                    // "Split" the chat message to get the first word
                    // This is used to check if the message is a valid command
                    // "!contraption EmicoMirari" becomes "!contraption"
                    var newChat = [data.payload.event.message.text.split(' ')[0], data.payload.event.message.text];
                    //console.log("Shortened chat: " + newChat);
                    // Then check to see if that message is a command
                    if (COMMANDS_DICTIONARY.has(newChat[0])) {
                        switch (COMMANDS_DICTIONARY.get(newChat[0])) {
                            case "quote":
                                // TODO: Add quote command
                                // This will require setting up a database to keep
                                // track of all of the quotes and their IDs.
                                break;
                            case "contraption":
                                commandContraption(data.payload.event.message.text);
                                break;
                            case "lurk":
                                commandLurk(data.payload.event.chatter_user_name);
                                break;
                            default:
                                sendChatMessage(COMMANDS_DICTIONARY.get(newChat[0]))
                                break;
                        }
                    }

                    break;
                case 'channel.raid':
                    console.log(`RAID #${data.payload.event.broadcaster_user_login} HAS STARTED A RAID`);

                    //const raidMessage = "! EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart";
                    sendChatMessage("Emico has started a raid! Join us with this message: EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart EMICO RAID emicomHeart");
                    break;
            }
            break;
    }
}


async function sendChatMessage(chatMessage) {
    let response = await fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + OAUTH_TOKEN,
            'Client-Id': CLIENT_ID,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            broadcaster_id: CHAT_CHANNEL_USER_ID,
            sender_id: BOT_USER_ID,
            message: chatMessage
        })
    });

    if (response.status != 200) {
        if (response.stats == 401) {
            refreshOauthToken();
            sendChatMessage(chatMessage);
        } else {
            let data = await response.json();
            console.error("Failed to send chat message");
            console.error(data);
        }
    } else {
        console.log("Sent chat message: " + chatMessage);
    }
}

async function registerEventSubListeners() {
    // Register channel.chat.message
    let response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + OAUTH_TOKEN,
            'Client-Id': CLIENT_ID,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'channel.chat.message',
            version: '1',
            condition: {
                broadcaster_user_id: CHAT_CHANNEL_USER_ID,
                user_id: BOT_USER_ID
            },
            transport: {
                method: 'websocket',
                session_id: websocketSessionID
            }
        })
    });

    if (response.status != 202) {
        if (response.status == 401) {
            refreshOauthToken();
            registerEventSubListeners();
        }
        let data = await response.json();
        console.error("Failed to subscribe to channel.chat.message. API call returned status code " + response.status);
        console.error(data);
        process.exit(1);
    } else {
        const data = await response.json();
        console.log(`Subscribed to channel.chat.message [${data.data[0].id}]`);
    }

    // Register channel.raid
    response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + OAUTH_TOKEN,
            'Client-Id': CLIENT_ID,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'channel.raid',
            version: '1',
            condition: {
                // channel.raid only allows ONE condition, 
                // The channel starting the raid (from_user_id),
                // or the channel receiving the raid (to_user_id)
                from_broadcaster_user_id: CHAT_CHANNEL_USER_ID
            },
            transport: {
                method: 'websocket',
                session_id: websocketSessionID
            }
        })
    });

    if (response.status != 202) {
        if (response.status == 401) {
            refreshOauthToken();
            registerEventSubListeners();
        }
        let data = await response.json();
        console.error("Failed to subscribe to channel.raid. API call returned status code " + response.status);
        console.error(data);
        process.exit(1);
    } else {
        const data = await response.json();
        console.log(`Subscribed to channel.raid [${data.data[0].id}]`);
    }
}


// Refreshes the OAuth token with the provided refresh token
// Not sure if this is working as intended yet so we are using Implicit tokens instead
// Send an HTTPS POST request with botData and parses response to .env
async function refreshOauthToken() {
    //console.log("Entered refreshOauth");

    // Set up URLParams for POST request
    let botData = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: process.env.REFRESH_OAUTH_TOKEN,
        grant_type: "refresh_token"
    });

    // Try refreshing OAuth token
    try {
        // HTTPS POST request
        let response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: botData.toString()
        });

        // Log errors
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}\n${response.message}`);
        }

        // Parse json and update .env file
        let json = await response.json();

        setEnvValue("OAUTH_TOKEN", json.access_token);
        setEnvValue("REFRESH_OAUTH_TOKEN", json.refresh_token);
    } catch (error) {
        console.error('Error fetching token:', error);
    }
}


// Updates .env file values using a regex. Not sure if this is working as intended yet.
// Credit to Marc on stackoverflow https://stackoverflow.com/a/65001580
function setEnvValue(key, value) {

    // read file from hdd & split if from a linebreak to a array
    const ENV_VARS = fs.readFileSync("./.env", "utf8").split(os.EOL);

    // find the env we want based on the key
    const target = ENV_VARS.indexOf(ENV_VARS.find((line) => {
        return line.match(new RegExp(key));
    }));

    // replace the key/value with the new value
    ENV_VARS.splice(target, 1, `${key}=${value}`);

    // write everything back to the file system
    fs.writeFileSync("./.env", ENV_VARS.join(os.EOL));
}


// Gimmick command that "locks" a user in a contraption
// Just used as a meme in chat, does not actually do anything negative
function commandContraption(chatMessage) {
    // Remove "!contraption"
    const newStr = chatMessage.trim().slice(13);

    // Split message to get each trapped user, where " " is the separator
    const trappedUsers = newStr.split(" ");

    console.log(trappedUsers);

    // Final string
    var output = "";

    // If multiple users are being put in the contraption
    if (trappedUsers.length > 2) {
        for (var i = 0; i < trappedUsers.length; i++) {
            // First user
            if (i === 0) {
                console.log('i==0');
                output += trappedUsers[i] + ", ";
            }
            // Last user
            else if (i === (trappedUsers.length - 1)) {
                console.log("last user");
                output += "and " + trappedUsers[i] + " have been thrown into the Contraption™!";
            }
            // All other users
            else {
                output += trappedUsers[i] + ", ";
            }
        }

    }
    else if (trappedUsers.length > 1) {
        output = trappedUsers[0] + " and " + trappedUsers[1] + " have been thrown into the Contraption™!";
    }
    else {
        output = trappedUsers[0] + " has been thrown into the Contraption™!";
    }

    sendChatMessage(output);
}

// Sends a thank you message to the lurking user
function commandLurk(chatter) {
    const randomLurkMessages = [
        "Thanks for lurking, " + chatter + "! I'm happy to be on your second monitor! emicomHeart",
        chatter + " has gone to pick some tulips. Thanks for the lurk!",
        chatter + " has other Emigo duties to tend to. See you again soon, thanks for lurking!",
        chatter + " has been distracted by bubbles... Thank you for lurking!"
    ]

    // Pick random lurk message
    const lurkMessage = Math.floor(Math.random() * randomLurkMessages.length);

    sendChatMessage(randomLurkMessages[lurkMessage]);
}


// Randomly selects a command to send to chat and repeats every 30 minutes.
// These commands should be related to other social platforms.
function scheduleSocials() {
    const socialCommands = ["!socials", "!discord"];
    const randomCommand = Math.floor(Math.random() * socialCommands.length);
    const selectedCommand = [socialCommands[randomCommand]]; // This is an array so selectedCommand[0] is the command instead of the first character in the string
    const timeToWait = 1800 * 1000; // seconds * 1000 to convert to milliseconds

    /*
    console.log("selectedCommand: " + selectedCommand);
    console.log("command[0]: " + selectedCommand[0]);
    console.log(COMMANDS_DICTIONARY.get(selectedCommand[0]));
    */

    sendChatMessage(COMMANDS_DICTIONARY.get(selectedCommand[0]));	// Call random socials command

    // Call this function every thirty minutes
    setTimeout(() => {
        scheduleSocials(); // Schedule the next call
    }, timeToWait);
}
