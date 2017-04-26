"use strict"

/**
 * Validates a t3services configuration object.
 *
 * @param {Object} config An object with properties corresponding to the schema parameter.
 * @param {Object} schema An array of objects defining the expected configuration elements.
 */
module.exports.validateConfig = function(config, schema) {
    if (config === null || typeof config === 'undefined')
        throw new Error('Null or undefined configuration data for t3auth');

    schema.forEach(val => {
        if (!config.hasOwnProperty(val.key)) {
            if (val.req)
                throw new Error(`'${val.key}' is required in the t3auth configuration`);
            else
                return;
        }
        if (typeof config[val.key] === 'undefined' || config[val.key] === null)
            throw new Error(`${val.key} is null or undefined`);
        if (typeof config[val.key] !== val.type)
            throw new TypeError(`${val.key} is not a(n) ${val.type}`);
        if (val.type === 'string') {
            config[val.key] = config[val.key].trim();
            if (val.req && config[val.key] === '')
                throw new Error(`${val.key} is required, but empty`);
        }
    })

    return Object.assign({}, config);
}

/**
 * Validates a string argument.
 *
 * @param {string} s A string that may not be undefined or empty.
 * @param {string} argName The name of the argument to validate.
 * @returns {string} The trimmed, non-empty string.
 */
module.exports.validateString = function(s, argName) {
    if (typeof s === 'undefined' || s === null)
        throw new Error(`Parameter '${argName}' was undefined or null`);
    if (typeof s !== 'string')
        throw new Error(`Parameter '${argName}' must be a non-empty string`);
    s = s.trim();
    if (s === '')
        throw new Error(`Parameter '${argName}' must be non-empty`);
    return s;
}

/**
 * Validates response handlers.
 *
 * @param {Object} responseHandlers An object containing "onSuccess" and "onError" functions to be executed
 * on the success or failure of a the authentication.
 */
module.exports.validateResponseHandlers = function (responseHandlers) {
    if (typeof responseHandlers === 'undefined' || responseHandlers === null)
        throw new Error('A response handler object is required');

    ['onSuccess', 'onError'].forEach(h => {
        if (!hasValidHandler(responseHandlers, h))
            throw new Error(`The ${h} function was not found in the response handler object`)
    });
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
        responseHandlers[name] && typeof responseHandlers[name] === 'function';
}