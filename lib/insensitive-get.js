/**
 * Performs a case insensitive property lookup.
 *
 * @param {Object} obj An object to be queried.
 * @param {string} propName The name of the property to look up.
 * @returns {*} The value corresponding to the supplied name.
 */
var insensitiveGet = function (obj, propName) {
    propName = propName.toLowerCase()
    for (var p in obj)
        if (p.toLowerCase() === propName)
            return obj[p];
}

module.exports = insensitiveGet;