
var CryptoJS = require('crypto-js');
var guid = require('uuid');
var validator = require('./validate');
var package = require('../package.json');

/**
 * Creates the "token" parameter for the authentication protocol.
 *
 * @param {Object} config A T3 configuration object.
 * @param {string} sessionId The ID of the current session.
 * @returns {string} A base64 encoded string to be used as a token.
 */
module.exports.createToken = function (config, sessionId) {
    var raw = `${config.secret} ${config.app}:${config.customer}:${sessionId}`;
    var bytes = CryptoJS.enc.Utf8.parse(raw);
    var digest = CryptoJS.SHA1(bytes);
    var token = digest.toString(CryptoJS.enc.Base64);
    if (config.verbose)
        console.error(`${raw} -> ${token}`);
    return token;
}

/**
 * Creates the "token" parameter for the authentication protocol.
 *
 * @param {Object} config A T3 configuration object.
 * @param {string} sessionId The ID of the current session.
 * @returns {string} A base64 encoded string to be used as a token.
 */
module.exports.requestOptions = function (config) {
    var sessionId = config.sessionId || guid();
    return {
        proxy: config.proxy,
        json: {},
        headers: {
            'X-SpeechCycle-SmartCare-CustomerID': config.customer,
            'X-SpeechCycle-SmartCare-ApplicationID': config.app,
            'X-SpeechCycle-SmartCare-Platform': 'All',
            'X-SpeechCycle-SmartCare-Culture': 'en-us',
            'X-SpeechCycle-SmartCare-SessionID': sessionId,
            'User-Agent': config.agent || `NodeJS smartcare v${package.version}`
        },
    };
}
