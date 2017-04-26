'use strict'

var request = require('request');
var t3util = require('./lib/t3util');
var insensitiveGet = require('./lib/insensitive-get');
var validator = require('./lib/validate');

var configSchema = [
    { key: 'endpoints', type: 'Array', req: true },
    { key: 'proxy', type: 'string', req: false },
    { key: 'customer', type: 'string', req: true },
    { key: 'app', type: 'string', req: true },
    { key: 'secret', type: 'string', req: true },
    { key: 'agent', type: 'string', req: false },
    { key: 'verbose', type: 'boolean', req: false }
];

var endpointsSchema = [
    { key: 'login', type: 'string', req: true },
    { key: 'search', type: 'string', req: true },
    { key: 'account', type: 'string', req: true },
];

/**
 * Result of a successful login command.
 * @typedef {Object} AuthToken
 * @property {string} Value The authenticated user's username.
 * @property {Array} AdditionalValues An array of arbitrary key-value pairs.
 * @property {string} FirstName The user's first name, if available.
 * @property {string} LastName The user's last name, if available.
 * @property {string} Phone The user's phone number, if available.
 * @property {string} Created The time at which this token was created.
 * @property {string} UserData An identifier for this user (eg. an email address).
 * @property {string} T3Token The authentication token to use for other T3 services.
 */

/**
 * Result of a successful search command.
 * @typedef {Object} Action
 * @property {string} Action Name of the action.
 * @property {string} Query Unused.
 * @property {number} Confidence Confidence value that this action is relevant to the user.
 * @property {string} Text Original text of the user's query.
 * @property {string} ConfirmationText Confirmation text to show the user.
 */

/**
 * Function called on successful authentication attempts.
 * @callback onSuccess  
 * @param {AuthToken|Action} response An object created from the body of the successful response.
 */

/**
 * Function called on failed authentication attempts.
 * @callback onError
 * @param {Object} error An Error object containing information about the failure.
 */

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
        this.t3config.endpoints = validator.validateConfig(config.endpoints, endpointsSchema);
    }

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

        var opts = t3util.requestOptions(this.t3config);
        opts.url = this.t3config.endpoints.login;
        opts.json = {
            'ID': username,
            'Password': password,
            'AdditionalValuesVersion': '2'
        };

        request.debug = !!this.t3config.verbose;
        request.post(opts, (error, rsp, body) => {
            if (error)
                responseHandlers.onError(error);
            var authHeader = insensitiveGet(rsp.headers, 'WWW-Authenticate');
            if (!authHeader || !authHeader.match(/^T3Auth /i))
                responseHandlers.onError(new Error('Challenge not found'));

            var token = t3util.createToken(this.t3config, opts.headers['X-SpeechCycle-SmartCare-SessionID']);
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

    /**
     * Searches for actions related to a query by a user.
     * @param {string} query User's search query.
     * @param {Object} responseHandlers An object that contains callbacks for search results.
     * @param {onSuccess} responseHandlers.onSuccess Function to call if the search is successful.
     * @param {onError} responseHandlers.onError Function to call in case of error.
     */
    search(query, responseHandlers) {
        query = validator.validateString(query, 'query');
        validator.validateResponseHandlers(responseHandlers);

        var opts = t3util.requestOptions(this.t3config);
        opts.url = this.t3config.endpoints.search + '/simple';
        opts.qs = { text: query };

        request.debug = !!this.t3config.verbose;
        request.post(opts, (error, rsp, body) => {
            if (error)
                responseHandlers.onError(error);
            if (rsp.statusCode !== 200)
                responseHandlers.onError(new Error('Search failed'));

            if (this.t3config.verbose)
                console.error(body);

            responseHandlers.onSuccess(body);
        });
    }
};

module.exports = T3Service;
