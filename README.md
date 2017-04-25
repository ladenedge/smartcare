# T3 Authentication Module

[![Build Status][travis-image]][travis-url] [![Coverage Status][coveralls-image]][coveralls-url]

This is a module to handle authentication for the T3 speech services.

## Installation

Install the module from NPM.

    npm install t3auth

## Usage

Including the module in the source defines the T3Auth class.  The constructor
for the class takes a configuration object.

    var T3Auth = require('t3auth');
    var t3auth = new T3Auth(config);

The class offers a single function, `login()`, which takes a username,
password, and a set of handlers for success and error conditions.

    t3auth.login(username, password, requestHandlers);

The response body containing the user's authentication token is supplied to
the `onSuccess` handler.

## Full Example

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

    var t3auth = new T3Auth(config);
    t3auth.login("username", "password", handlers);

## License

This module is licensed under the [MIT License](https://opensource.org/licenses/MIT).
Copyright &copy; 2017, Verint Inc.
