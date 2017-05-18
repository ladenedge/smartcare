'use strict';

var url = require('url');
var request = require('request');
var async = require('async');
var t3util = require('./lib/t3util');
var insensitiveGet = require('./lib/insensitive-get');
var validator = require('./lib/validate');

var configSchema = [
    { key: 'endpoints', type: 'object', req: true },
    { key: 'customer', type: 'string', req: true },
    { key: 'app', type: 'string', req: true },
    { key: 'secret', type: 'string', req: true },
    { key: 'agent', type: 'string', req: false },
    { key: 'platform', type: 'string', req: false },
    { key: 'verbose', type: 'boolean', req: false }
];

var endpointsSchema = [
    { key: 'login_t3', type: 'string', req: false },
    { key: 'login_db', type: 'string', req: false },
    { key: 'search', type: 'string', req: false },
    { key: 'account', type: 'string', req: false },
    { key: 'dashboard', type: 'string', req: false },
    { key: 'proxy', type: 'string', req: false }
];

/**
 * This callback is displayed as part of the Requester class.
 * @callback SmartCare~callback
 * @param {Error} err An Error object containing information about a failure, or null if the call succeeded.
 * @param {AuthToken|Action|SmartCare} response An object created from the body of the successful response.
 */

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
 * Module for the T3 speech services.
 */
class SmartCare {
    /**
     * Constructs a SmartCare client with the supplied configuration.
     * @param {Object} config Configuration for the module.
     * @param {Object} config.endpoints Set of endpoints for individual SmartCare services.  Only those endpoints that will be used are required.
     * @param {string} [config.endpoints.login] Full endpoint for the authentication service.
     * @param {string} [config.endpoints.signin] Full endpoint for the WinForms signin service.
     * @param {string} [config.endpoints.search] Full endpoint for the T3 search service.
     * @param {string} [config.endpoints.account] Full endpoint for the account and billing service.
     * @param {string} [config.endpoints.proxy] Optional proxy endpoint.
     * @param {string} config.customer Identifier of the customer/tenant.
     * @param {string} config.app Identifier of the calling application.
     * @param {string} config.secret The shared secret to use during authentication.
     * @param {string} [config.platform] The platform on which the application is running. (Eg. 'Web', 'DesktopWeb'.)
     * @param {string} [config.agent] A name or identifier for the calling application.
     * @param {boolean} [config.verbose] Whether to output detailed logging to stderr.
     */
    constructor(config) {
        this.config = validator.validateConfig(config, configSchema);
        this.config.endpoints = validator.validateConfig(config.endpoints, endpointsSchema);
        this.cookies = request.jar();
    }

    /**
     * Attempts the T3 authentication procedure.
     * @param {string} username A string containing the username to authenticate.
     * @param {string} password A string containing the user's password.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    t3login(username, password, callback) {
        username = validator.validateString(username, 'username');
        password = validator.validateString(password, 'password');
        callback = validator.validateCallback(callback);
        validator.validateString(this.config.endpoints.login_t3, 'login_t3 endpoint');

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.login_t3;
        opts.json = {
            'ID': username,
            'Password': password,
            'AdditionalValuesVersion': '2'
        };

        request.debug = !!this.config.verbose;
        request.post(opts, (error, rsp, body) => {
            if (error)
                callback(error);
            var authHeader = insensitiveGet(rsp.headers, 'WWW-Authenticate');
            if (!authHeader || !authHeader.match(/^T3Auth /i))
                callback(new Error('Challenge not found'));

            var token = t3util.createToken(this.config, opts.headers['X-SpeechCycle-SmartCare-SessionID']);
            opts.headers['Authorization'] = authHeader + `, token=${token}`;

            request.post(opts, (error, rsp, body) => {
                if (error)
                    return callback(error);
                if (rsp.statusCode !== 200)
                    return callback(new Error('Authentication failed'));
                if (this.config.verbose)
                    console.error(body);

                this.auth = Object.assign({}, body);
                callback(null, body);
            });
        });
    }

    /**
     * Attempts the dashboard signin procedure.
     * @param {Object} auth An object containing dashboard authentication parameters.
     * @param {string} auth.Value A string identifying the user to sign in.
     * @param {string} auth.T3Token A valid T3 token for the specified user.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    dashboardLogin(auth, callback) {
        validator.validateAuth(auth);
        callback = validator.validateCallback(callback);
        validator.validateString(this.config.endpoints.login_db, 'login_db endpoint');

        this.auth = auth;
        var opts = t3util.signinOptions(this.config, this.auth);
        opts.jar = this.cookies;

        request.post(opts, (error, rsp, body) => {
            if (error)
                return callback(error);
            if (rsp.statusCode !== 302)
                return callback(new Error('Signin protocol error'));
            var location = insensitiveGet(rsp.headers, 'Location');
            if (location.includes('forbidden'))
                return callback(new Error('Signin failed'));

            var signinUrl = url.parse(this.config.endpoints.login_db);
            this.config.endpoints.dashboard = `${signinUrl.protocol}//${signinUrl.host}${location}`;

            callback();
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
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    refreshTouchmap(callback) {
        callback = validator.validateCallback(callback);
        validator.validateString(this.config.endpoints.search, 'search endpoint');

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.search + '/touch-map';

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return callback(error);
            if (rsp.statusCode !== 200)
                return callback(new Error('Touchmap refresh failed'));
            if (this.config.verbose)
                console.error(body);

            this.menu = body.ServiceItems;
            this.actions = { refreshTime: new Date() };
            body.Actions.forEach(a => {
                this.actions[a.Name] = a;
            });

            callback(null, this);
        });
    }

    /**
     * Searches for actions related to a query by a user.
     * @param {string} query User's search query.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    search(query, callback) {
        query = validator.validateString(query, 'query');
        callback = validator.validateCallback(callback);
        validator.validateString(this.config.endpoints.search, 'search endpoint');

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.search + '/simple';
        opts.qs = { text: query };

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return callback(error);
            if (rsp.statusCode !== 200)
                return callback(new Error('Search failed'));
            if (this.config.verbose)
                console.error(body);

            callback(null, body);
        });
    }

    /**
     * Retrieves an authenticated user's account information.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    getAccount(callback) {
        validator.validateString(this.config.endpoints.account, 'account endpoint');
        callback = validator.validateCallback(callback);
        if (!this.isAuthenticated)
            throw new Error('An active login is required');

        var opts = t3util.requestOptions(this.config);
        opts.url = this.config.endpoints.account + '/account/get-by-number';
        Object.assign(opts.headers, t3util.authHeaders(this.auth));

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return callback(error);
            if (rsp.statusCode !== 200)
                return callback(new Error('Account lookup failed'));
            if (this.config.verbose)
                console.error(body);

            callback(null, body);
        });
    }

    /**
     * Retrieves an authenticated user's statements.
     * @param {number} count The number of statements to retrieve, starting with the latest.  Must be at least 1.
     * @param {boolean} pdf Whether to get the statements in PDF form or JSON.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    getStatements(count, pdf, callback) {
        validator.validateNumber(count, 1, 'count');
        validator.validateBoolean(pdf, 'pdf');
        validator.validateString(this.config.endpoints.account, 'account endpoint');
        callback = validator.validateCallback(callback);
        if (!this.isAuthenticated)
            throw new Error('An active login is required');

        var opts = t3util.requestOptions(this.config);
        var path = '/' + (pdf ? 'pdf-statement' : 'bill') + '/' + count;
        opts.url = this.config.endpoints.account + path;
        Object.assign(opts.headers, t3util.authHeaders(this.auth));

        request.debug = !!this.config.verbose;
        request.get(opts, (error, rsp, body) => {
            if (error)
                return callback(error);
            if (rsp.statusCode !== 200)
                return callback(new Error('Statement lookup failed'));
            if (this.config.verbose)
                console.error(body);

            callback(null, body);
        });
    }

    /**
     * Retrieves a user's dashboard items.
     * @param {SmartCare~callback} [callback] A response handler to be called when the function completes.
     */
    dashboard(callback) {
        callback = validator.validateCallback(callback);
        validator.validateString(this.config.endpoints.dashboard, 'dashboard endpoint');
        if (!this.isAuthenticated)
            throw new Error('An active login is required');

        var opts = t3util.dashboardOptions(this.config, this.cookies);
        request.debug = !!this.config.verbose;

        var endpoints = [
            'GetBillingData',
            'GetUsageData',
            'GetOutageData',
            'GetAppointmentData'
        ];
        async.map(endpoints, (endpoint, finished) => {
            request.post(`/${endpoint}`, opts, (error, rsp, body) => {
                if (error)
                    return finished(error);
                if (rsp.statusCode !== 200)
                    return finished(new Error('Dashboard refresh failed'));
                if (this.config.verbose)
                    console.error(body);
                finished(null, body);
            });
        }, (err, results) => {
            if (err)
                return callback(err);
            var results = results.reduce((prev, cur, i) => {
                prev[endpoints[i].replace('Get', '')] = results[i];
                return prev;
            }, {});
            callback(null, results);
        });
    }
};

module.exports = SmartCare;
