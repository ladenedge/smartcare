
var CryptoJS = require('crypto-js');
var guid = require('uuid');
var validator = require('./validate');
var package = require('../package.json');

var versionString = `NodeJS smartcare v${package.version}`;

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
        proxy: config.endpoints.proxy,
        rejectUnauthorized: false,
        json: {},
        headers: {
            'X-SpeechCycle-SmartCare-CustomerID': config.customer,
            'X-SpeechCycle-SmartCare-ApplicationID': config.app,
            'X-SpeechCycle-SmartCare-Platform': 'All',
            'X-SpeechCycle-SmartCare-Culture': 'en-us',
            'X-SpeechCycle-SmartCare-SessionID': sessionId,
            'User-Agent': config.agent || versionString
        },
    };
}

module.exports.signinOptions = function (config, auth) {
    var sessionId = config.sessionId || guid();
    var addValues = (auth.AdditionalValues && auth.AdditionalValues.length > 0) ? auth.AdditionalValues.join(',') : null;
    return {
        url: config.endpoints.signin,
        proxy: config.endpoints.proxy,
        rejectUnauthorized: false,
        headers: {
            'Accept': 'application/json',
            'User-Agent': config.agent || versionString
        },
        form: {
            's_customerId': config.customer,
            's_applicationId': config.app,
            's_sessionId': sessionId,
            's_userId': auth.Value,
            's_userName': auth.Value,
            's_userData': '',
            's_t3token': auth.T3Token,
            's_platform': 'All',
            's_platformVersion': '',
            's_applicationVersion': '2',
            's_additionalValues': addValues
        }
    };
}

module.exports.dashboardOptions = function (config, jar) {
    return {
        baseUrl: config.endpoints.dashboard,
        proxy: config.endpoints.proxy,
        rejectUnauthorized: false,
        headers: {
            'User-Agent': config.agent || versionString
        },
        json: {},
        jar: jar
    };
}

/**
 * Generates an object with key/value pairs corresponding to the HTTP headers necessary to make authenticated requests.
 *
 * @param {Object} auth A T3 authentication result.
 * @returns {Object} An object containing HTTP header names and values.
 */
module.exports.authHeaders = function (auth) {
    var headers = {};
    headers['X-SpeechCycle-SmartCare-UserID'] = auth.Value;
    headers['X-SpeechCycle-SmartCare-UserName'] = auth.Value;
    headers['X-SpeechCycle-SmartCare-T3Token'] = auth.T3Token;
    if (auth.AdditionalValues && auth.AdditionalValues.length > 0)
        headers['X-SpeechCycle-SmartCare-AdditionalValues'] = auth.AdditionalValues.join(',');
    return headers;
}
