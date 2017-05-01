'use strict';

var request = require('request');
var t3util = require('./lib/t3util');
var insensitiveGet = require('./lib/insensitive-get');
var validator = require('./lib/validate');

var configSchema = [
    { key: 'endpoints', type: 'object', req: true },
    { key: 'customer', type: 'string', req: true },
    { key: 'app', type: 'string', req: true },
    { key: 'secret', type: 'string', req: true },
    { key: 'name', type: 'string', req: false },
    { key: 'platform', type: 'string', req: false },
    { key: 'verbose', type: 'boolean', req: false }
];

var endpointsSchema = [
    { key: 'login', type: 'string', req: false },
    { key: 'search', type: 'string', req: false },
    { key: 'account', type: 'string', req: false },
    { key: 'proxy', type: 'string', req: false }
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
 * @param {AuthToken|Action|undefined} response An object created from the body of the successful response.
 */

/**
 * Function called on failed authentication attempts.
 * @callback onError
 * @param {Object} error An Error object containing information about the failure.
 */

/**
 * Authentication module for the T3 speech services.
 */
class SmartCare {
    /**
     * Constructs a SmartCare client with the supplied configuration.
     * @param {Object} config Configuration for the module.
     * @param {Object} config.endpoints Set of endpoints for individual SmartCare services.  Only those endpoints that will be used are required.
     * @param {string} [config.endpoints.login] Full endpoint for the authentication service.
     * @param {string} [config.endpoints.search] Full endpoint for the T3 search service.
     * @param {string} [config.endpoints.account] Full endpoint for the account and billing service.
     * @param {string} [config.endpoints.proxy] Optional proxy endpoint.
     * @param {string} config.customer Identifier of the customer/tenant.
     * @param {string} config.app Identifier of the calling application.
     * @param {string} config.secret The shared secret to use during authentication.
     * @param {string} [config.platform] The platform on which the application is running. (Eg. 'Web', 'DesktopWeb'.)
     * @param {string} [config.name] A name or identifier for the calling application.
     * @param {boolean} [config.verbose] Whether to output detailed logging to stderr.
     */
    constructor(config) {
        this.config = validator.validateConfig(config, configSchema);
        this.config.endpoints = validator.validateConfig(config.endpoints, endpointsSchema);
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
        validator.validateString(this.config.endpoints.login, 'login endpoint');
        validator.validateResponseHandlers(responseHandlers);

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.login;
        opts.json = {
            'ID': username,
            'Password': password,
            'AdditionalValuesVersion': '2'
        };

        request.debug = !!this.config.verbose;
        request.post(opts, (error, rsp, body) => {
            if (error)
                responseHandlers.onError(error);
            var authHeader = insensitiveGet(rsp.headers, 'WWW-Authenticate');
            if (!authHeader || !authHeader.match(/^T3Auth /i))
                responseHandlers.onError(new Error('Challenge not found'));

            var token = t3util.createToken(this.config, opts.headers['X-SpeechCycle-SmartCare-SessionID']);
            opts.headers['Authorization'] = authHeader + `, token=${token}`;

            request.post(opts, (error, rsp, body) => {
                if (error)
                    return responseHandlers.onError(error);
                if (rsp.statusCode !== 200)
                    return responseHandlers.onError(new Error('Authentication failed'));
                if (this.config.verbose)
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
        return !!this.auth && !!this.auth.T3Token && this.auth.T3Token.length > 0;
    }

    /**
     * Gets whether the menu map is cached and current.
     * @returns {boolean} Whether the client has a valid T3 menu.
     * @todo Check menu expiration.
     */
    get hasMenu() {
        return !!this.menu && this.actions.hasOwnProperty('refreshTime');
    }

    /**
     * Gets whether the action set is cached and current.
     * @returns {boolean} Whether the client has a valid T3 touchmap.
     * @todo Check map expiration.
     */
    get hasActions() {
        return !!this.actions && this.actions.hasOwnProperty('refreshTime');
    }

    /**
     * Updates the menu items and actions database (ie. the "touchmap").
     * @param {Object} responseHandlers An object that contains callbacks for search results.
     * @param {onSuccess} responseHandlers.onSuccess Function to call if the refresh is successful.
     * @param {onError} responseHandlers.onError Function to call in case of error.
     */
    refreshTouchmap(responseHandlers) {
        validator.validateString(this.config.endpoints.search, 'search endpoint');
        validator.validateResponseHandlers(responseHandlers);

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.search + '/touch-map';

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return responseHandlers.onError(error);
            if (rsp.statusCode !== 200)
                return responseHandlers.onError(new Error('Touchmap refresh failed'));
            if (this.config.verbose)
                console.error(body);

            this.menu = body.ServiceItems
                .filter(si => body.Actions.find(a => a.Name == si.Action))
                .map(si => {
                    si.Action = body.Actions.find(a => a.Name == si.Action);
                    return si;
                });

            this.actions = { refreshTime: new Date() };
            body.Actions.forEach(a => {
                this.actions[a.Name] = a;
            });

            responseHandlers.onSuccess();
        });
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
        validator.validateString(this.config.endpoints.search, 'search endpoint');
        validator.validateResponseHandlers(responseHandlers);

        var performSearch = () => {
            var opts = t3util.requestOptions(this.config);
            opts.url = this.config.endpoints.search + '/simple';
            opts.qs = { text: query };

            request.debug = !!this.config.verbose;
            request.get(opts, (error, rsp, body) => {
                if (error)
                    return responseHandlers.onError(error);
                if (rsp.statusCode !== 200)
                    return responseHandlers.onError(new Error('Search failed'));
                if (this.config.verbose)
                    console.error(body);

                body.Results.forEach(a => {
                    if (typeof a.Action !== 'object')
                        a.Action = this.actions[a.Action];
                });

                responseHandlers.onSuccess(body);
            });
        };

        if (this.hasActions)
            performSearch();
        else {
            this.refreshTouchmap({
                onError: responseHandlers.onError,
                onSuccess: () => { performSearch(); }
            });
        }
    }

    /**
     * Retrieves an authenticated user's account information.
     * @param {Object} responseHandlers An object that contains callbacks for account results.
     * @param {onSuccess} responseHandlers.onSuccess Function to call if the lookup is successful.
     * @param {onError} responseHandlers.onError Function to call in case of error.
     */
    getAccount(responseHandlers) {
        validator.validateString(this.config.endpoints.account, 'account endpoint');
        validator.validateResponseHandlers(responseHandlers);
        if (!this.isAuthenticated)
            throw new Error('An active login is required');

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.account + '/account/get-by-number';
        Object.assign(opts.headers, t3util.authHeaders(this.auth));

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return responseHandlers.onError(error);
            if (rsp.statusCode !== 200)
                return responseHandlers.onError(new Error('Account lookup failed'));
            if (this.config.verbose)
                console.error(body);

            responseHandlers.onSuccess(body);
        });
    }

    /**
     * Retrieves an authenticated user's statements.
     * @param {number} count The number of statements to retrieve, starting with the latest.  Must be at least 1.
     * @param {boolean} pdfs Whether to get the statements in PDF form or JSON.
     * @param {Object} responseHandlers An object that contains callbacks for statement results.
     * @param {onSuccess} responseHandlers.onSuccess Function to call if the lookup is successful.
     * @param {onError} responseHandlers.onError Function to call in case of error.
     */
    getStatements(count, pdf, responseHandlers) {
        validator.validateNumber(count, 1, 'count');
        validator.validateBoolean(pdf, 'pdf');
        validator.validateString(this.config.endpoints.account, 'account endpoint');
        validator.validateResponseHandlers(responseHandlers);
        if (!this.isAuthenticated)
            throw new Error('An active login is required');

        var opts = t3util.requestOptions(this.config);
        var path = '/' + (pdf ? 'pdf-statement' : 'bill') + '/' + count;
        opts.url = this.config.endpoints.account + path;
        Object.assign(opts.headers, t3util.authHeaders(this.auth));

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return responseHandlers.onError(error);
            if (rsp.statusCode !== 200)
                return responseHandlers.onError(new Error('Account lookup failed'));
            if (this.config.verbose)
                console.error(body);

            responseHandlers.onSuccess(body);
        });
    }
};

module.exports = SmartCare;
