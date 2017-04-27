# SmartCare Speech Services Module

[![Build Status](https://travis-ci.org/ladenedge/smartcare.svg?branch=master)](https://travis-ci.org/ladenedge/smartcare)
[![Coverage Status](https://coveralls.io/repos/github/ladenedge/smartcare/badge.svg)](https://coveralls.io/github/ladenedge/smartcare)
[![dependencies Status](https://david-dm.org/ladenedge/smartcare/status.svg)](https://david-dm.org/ladenedge/smartcare)

This is a Node module to handle the client side of the SmartCare speech services.

## Installation

Install the module from NPM.

    npm install smartcare

## Usage

Including the module in the source defines the SmartCare class.  The constructor
for the class takes a configuration object.

    var SmartCare = require('smartcare');
    var client = new SmartCare(config);

The class offers [a number of functions](https://github.com/ladenedge/smartcare/wiki#smartcare),
most of which require a set of handlers for success and error conditions:

    var handlers = {
        onSuccess: function(rsp) { }
        onSuccess: function(err) { }
    }

Where `rsp` is the body of the (JSON) response, in object form, and `err` is an **Error**
object containing informtation about the failure.

Some functions also require authentication with the `login()` function,
which takes a username, password, and the standard set of handlers.

    client.login(username, password, requestHandlers);

The response body containing the user's authentication token is supplied to
the `onSuccess` handler, and it will also be saved by the class itself.

## Full Example

    var SmartCare = require('smartcare');

    var config = {
        endpoint: 'https://sc.com/auth',
        customer: 'CustomerName',
        app: 'AppName',
        secret: 'SharedSecret',
        verbose: false
    };
    var handlers = {
        onSuccess: (rsp) => { console.log(rsp); },
        onError: (err) => { console.log(err.message); },
    };

    var client = new SmartCare(config);
    client.login("username", "password", handlers);

## License

This module is licensed under the [MIT License](https://opensource.org/licenses/MIT).
Copyright &copy; 2017, Verint Inc.
