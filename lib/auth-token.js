
var CryptoJS = require('crypto-js');

/**
 * Creates the "token" parameter for the authentication protocol.
 *
 * @param {Object} config A T3 configuration object.
 * @param {string} sessionId The ID of the current session.
 * @returns {string} A base64 encoded string to be used as a token.
 */
function createToken(config, sessionId) {
    var raw = `${config.secret} ${config.app}:${config.customer}:${sessionId}`;
    var bytes = CryptoJS.enc.Utf8.parse(raw);
    var digest = CryptoJS.SHA1(bytes);
    var token = digest.toString(CryptoJS.enc.Base64);
    if (config.verbose)
        console.error(`${raw} -> ${token}`);
    return token;
}

module.exports = createToken;