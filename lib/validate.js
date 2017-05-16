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
            throw new TypeError(`${val.key} should be a(n) ${val.type}`);
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
module.exports.validateString = function (s, argName) {
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
 * Validates a boolean argument.
 *
 * @param {boolean} n A boolean that may not be undefined or null.
 * @param {string} argName The name of the argument to validate.
 */
module.exports.validateBoolean = function (b, argName) {
    if (typeof b === 'undefined' || b === null)
        throw new Error(`Parameter '${argName}' was undefined or null`);
    if (typeof b !== 'boolean')
        throw new Error(`Parameter '${argName}' must be a boolean`);
}

/**
 * Validates a number argument.
 *
 * @param {number} i A number that may not be undefined.
 * @param {number} min The minimum value for the supplied number.
 * @param {string} argName The name of the argument to validate.
 */
module.exports.validateNumber = function (i, min, argName) {
    if (typeof i === 'undefined' || i === null)
        throw new Error(`Parameter '${argName}' was undefined or null`);
    if (typeof i !== 'number')
        throw new Error(`Parameter '${argName}' must be a number`);
    if (i < min)
        throw new Error(`Parameter '${argName}' must be at least ${min}`);
}

/**
 * Validates a response handler.
 *
 * @param {SmartCare~callback} callback The callback to validate.
 */
module.exports.validateCallback = function (callback) {
    if (!callback)
        return () => { };
    if (callback && typeof callback !== 'function')
        throw new Error(`'callback' argument must be a function`)
    return callback;
}
