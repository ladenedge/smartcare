'use strict'

var request = require('request');
var guid = require('uuid');
var tokenizer = require('./lib/auth-token');
var insensitiveGet = require('./lib/insensitive-get');
var validator = require('./lib/validate');

var configSchema = [
    { key: 'endpoint', type: 'string', req: true },
    { key: 'proxy', type: 'string', req: false },
    { key: 'customer', type: 'string', req: true },
    { key: 'app', type: 'string', req: true },
    { key: 'secret', type: 'string', req: true },
    { key: 'verbose', type: 'boolean', req: false }
];

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
        this.t3config = validator.validateConfig(config, configSchema);
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
        username = validator.validateString(username, 'username');
        password = validator.validateString(password, 'password');
        validator.validateResponseHandlers(responseHandlers);

        var sessionId = this.t3config.sessionId || guid();
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
        };

        request.debug = !!this.t3config.verbose;
        request.post(opts, (error, rsp, body) => {
            if (error)
                responseHandlers.onError(error);
            var authHeader = insensitiveGet(rsp.headers, 'WWW-Authenticate');
            if (!authHeader || !authHeader.match(/^T3Auth /i))
                responseHandlers.onError(new Error('Challenge not found'));

            var token = tokenizer(this.t3config, sessionId);
            opts.headers['Authorization'] = authHeader + `, token=${token}`;

            request.post(opts, (error, rsp, body) => {
                if (error)
                    responseHandlers.onError(error);
                if (rsp.statusCode !== 200)
                    responseHandlers.onError(new Error('Authentication failed'));

                if (this.t3config.verbose)
                    console.error(body);

                this.auth = Object.assign({}, body);
                responseHandlers.onSuccess(body);
            });
        });
    }

    /**
     * Gets whether a successful login has taken place.
     * @returns {boolean} Whether the client has a valid T3 token.
     * @todo Check token expiration.
     */
    get isAuthenticated() {
        return this.auth && this.auth.T3Token && this.auth.T3Token.length > 0;
    }
};

module.exports = T3Service;
