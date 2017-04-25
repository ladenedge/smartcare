'use strict'

var request = require('request')
var guid = require('guid')
var CryptoJS = require('crypto-js')

var configSchema = [
    { key: 'endpoint', type: 'string', req: true },
    { key: 'proxy', type: 'string', req: false },
    { key: 'customer', type: 'string', req: true },
    { key: 'app', type: 'string', req: true },
    { key: 'secret', type: 'string', req: true },
    { key: 'verbose', type: 'boolean', req: false }
]

/**
 * Authentication module for the T3 speech services.
 */
class T3Service {
    /**
     * Constructs a T3 client with the supplied configuration.
     * @param {Object} config Configuration for the authentication procedure.
     * @param {string} config.endpoint Full URL to the T3 auth service.
     * @param {string} [config.proxy] Optional proxy endpoint.
     * @param {string} config.customer Identifier of the customer/tenant.
     * @param {string} config.app Identifier of the calling application.
     * @param {string} config.secret The shared secret to use during authentication.
     * @param {boolean} [config.verbose] Whether to output detailed logging to stderr.
     */
    constructor(config) {
        this.t3config = validateConfig(config, configSchema)
    }

    /**
     * Function called on successful authentication attempts.
     * @callback onSuccess
     * @param {Object} response An object created from the body of the successful response.
     * @param {string} response.Value The authenticated user's username.
     * @param {Array} response.AdditionalValues An array of arbitrary key-value pairs.
     * @param {string} response.FirstName The user's first name, if available.
     * @param {string} response.LastName The user's last name, if available.
     * @param {string} response.Phone The user's phone number, if available.
     * @param {string} response.Created The time at which this token was created.
     * @param {string} response.UserData An identifier for this user (eg. an email address).
     * @param {string} response.T3Token The authentication token to use for other T3 services.
     */
    /**
     * Function called on failed authentication attempts.
     * @callback onError
     * @param {Object} error An Error object containing information about the failure.
     */

    /**
     * Attempts the authentication procedure.
     * @param {string} username A string containing the username to authenticate.
     * @param {string} password A string containing the user's password.
     * @param {Object} responseHandlers An object that contains callbacks for authentication results.
     * @param {onSuccess} responseHandlers.onSuccess Function to call if authentication is successful.
     * @param {onError} responseHandlers.onError Function to call in case of error.
     */
    login(username, password, responseHandlers) {
        username = validateString(username, 'username')
        password = validateString(password, 'password')
        validateResponseHandlers(responseHandlers)

        var sessionId = this.t3config.sessionId || guid.raw()
        var opts = {
            url: this.t3config.endpoint,
            proxy: this.t3config.proxy,
            headers: {
                'X-SpeechCycle-SmartCare-CustomerID': this.t3config.customer,
                'X-SpeechCycle-SmartCare-ApplicationID': this.t3config.app,
                'X-SpeechCycle-SmartCare-SessionID': sessionId,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            json: {
                'ID': username,
                'Password': password,
                'AdditionalValuesVersion': '2'
            }
        }

        request.debug = !!this.t3config.verbose
        request.post(opts, (error, rsp, body) => {
            if (error)
                responseHandlers.onError(error)
            var authHeader = insensitiveGet(rsp.headers, 'WWW-Authenticate')
            if (!authHeader || !authHeader.match(/^T3Auth /i))
                responseHandlers.onError(new Error('Challenge not found'))

            var token = createToken(this.t3config, sessionId)
            opts.headers['Authorization'] = authHeader + `, token=${token}`

            request.post(opts, (error, rsp, body) => {
                if (error)
                    responseHandlers.onError(error)
                if (rsp.statusCode !== 200)
                    responseHandlers.onError(new Error('Authentication failed'))

                if (this.t3config.verbose)
                    console.error(body)

                this.auth = Object.assign({}, body);
                responseHandlers.onSuccess(body)
            })
        })
    }

    /**
     * Gets whether a successful login has taken place.
     * @returns {boolean} Whether the client has a valid T3 token.
     */
    get isAuthenticated() {
        // TODO: check for expiry?
        return this.auth && this.auth.T3Token && this.auth.T3Token.length > 0;
    }
};

/**
 * Creates the "token" parameter for the authentication protocol.
 *
 * @param {Object} config A T3 configuration object.
 * @param {string} sessionId The ID of the current session.
 * @returns {string} A base64 encoded string to be used as a token.
 */
var createToken = function(config, sessionId) {
    var raw = `${config.secret} ${config.app}:${config.customer}:${sessionId}`
    var bytes = CryptoJS.enc.Utf8.parse(raw)
    var digest = CryptoJS.SHA1(bytes)
    var token = digest.toString(CryptoJS.enc.Base64)
    if (config.verbose)
        console.error(`${raw} -> ${token}`)
    return token
}

/**
 * Performs a case insensitive property lookup.
 *
 * @param {Object} obj An object to be queried.
 * @param {string} propName The name of the property to look up.
 * @returns {*} The value corresponding to the supplied name.
 */
var insensitiveGet = function(obj, propName) {
    propName = propName.toLowerCase()
    for (var p in obj)
        if (p.toLowerCase() === propName) { return obj[p] }
}

/**
 * Validates a t3auth configuration object.
 *
 * @param {Object} config An object with properties corresponding to the schema parameter.
 * @param {Object} schema An array of objects defining the expected configuration elements.
 */
var validateConfig = function(config, schema) {
    if (config === null || typeof config === 'undefined')
        throw new Error('Null or undefined configuration data for t3auth')

    schema.forEach(val => {
        if (!config.hasOwnProperty(val.key)) {
            if (val.req)
                throw new Error(`'${val.key}' is required in the t3auth configuration`)
            else
                return
        }
        if (typeof config[val.key] === 'undefined' || config[val.key] === null)
            throw new Error(`${val.key} is null or undefined`)
        if (typeof config[val.key] !== val.type)
            throw new TypeError(`${val.key} is not a ${val.t}`)
        if (val.type === 'string') {
            config[val.key] = config[val.key].trim()
            if (val.req && config[val.key] === '')
                throw new Error(`${val.key} is required, but empty`)
        }
    })

    return Object.assign({}, config)
}

/**
 * Validates a string argument.
 *
 * @param {string} s A string that may not be undefined or empty.
 * @param {string} argName The name of the argument to validate.
 * @returns {string} The trimmed, non-empty string.
 */
var validateString = function(s, argName) {
    if (typeof s === 'undefined' || s === null)
        throw new Error(`Parameter '${argName}' was undefined or null`)
    if (typeof s !== 'string')
        throw new Error(`Parameter '${argName}' must be a non-empty string`)
    s = s.trim()
    if (s === '')
        throw new Error(`Parameter '${argName}' must be non-empty`)
    return s
}

/**
 * Validates response handlers.
 *
 * @param {Object} responseHandlers An object containing "onSuccess" and "onError" functions to be executed
 * on the success or failure of a web request.
 */
var validateResponseHandlers = function(responseHandlers) {
    if (typeof responseHandlers === 'undefined' || responseHandlers === null)
        throw new Error('A response handler object is required')

    ['onSuccess', 'onError'].forEach(h => {
        if (!hasValidHandler(responseHandlers, h))
            throw new Error(`The ${h} function was not found in the response handler object`)
    })
}

/**
 * Validates a particular response handler.
 *
 * @param {Object} responseHandlers An object containing functions to be executed.
 * @param {string} name The name of the response handler to validate.
 * @returns {boolean} Whether the response handler object contains a valid handler with the supplied name.
 */
var hasValidHandler = function(responseHandlers, name) {
    return responseHandlers && responseHandlers.hasOwnProperty(name) &&
        responseHandlers[name] && typeof responseHandlers[name] === 'function'
}

module.exports = T3Auth
