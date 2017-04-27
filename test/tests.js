var assert = require('assert');
var sinon = require('sinon');
var request = require('request');
var SmartCare = require('../smartcare');

var validConfig = {
    endpoints: {
         login: 'https://t3.sc.com',
         search: 'https://s.sc.com',
         account: 'https://a.sc.com'
    },
    customer: 'Tester',
    app: 'Mocha',
    secret: 'secret',
    verbose: false,

    clone: function () {
        return JSON.parse(JSON.stringify(this));
    }
};

var badStringValues = [null, "", " \t ", 1];
var badHandlerValues = [null, ""];
var requiredParams = ['endpoints', 'customer', 'app', 'secret'];


describe('constructor', function() {
    it('should throw on undefined config', function() {
        assert.throws(() => new SmartCare(), Error);
    });
    it('should throw on null config', function() {
        assert.throws(() => new SmartCare(null), Error);
    });
    Object.keys(validConfig).forEach(prop => {
        if (prop === 'clone')
            return;
        it(`should throw on mistyped property ${prop}`, function() {
            let invalidConfig = validConfig.clone();
            invalidConfig[prop] = function() { };
            assert.throws(() => new SmartCare(invalidConfig), TypeError);
        });
    });
    requiredParams.forEach(prop => {
        it(`should throw on undefined property ${prop}`, function() {
            let invalidConfig = validConfig.clone();
            delete invalidConfig[prop];
            assert.throws(() => new SmartCare(invalidConfig), Error);
        });
        it(`should throw on null property ${prop}`, function() {
            let invalidConfig = validConfig.clone();
            invalidConfig[prop] = null;
            assert.throws(() => new SmartCare(invalidConfig), Error);
        });
    });
    requiredParams.filter(v => typeof validConfig[v] === 'string').forEach(prop => {
        it(`should throw on empty string property ${prop}`, function() {
            let invalidConfig = validConfig.clone();
            invalidConfig[prop] = "";
            assert.throws(() => new SmartCare(invalidConfig), Error);
        });
        it(`should throw on whitespace string property ${prop}`, function() {
            let invalidConfig = validConfig.clone();
            invalidConfig[prop] = " \t ";
            assert.throws(() => new SmartCare(invalidConfig), Error);
        });
    });
    it('should not throw on valid config', function() {
        assert.doesNotThrow(() => new SmartCare(validConfig));
    });
});

describe('login()', function() {
    var smartcare = new SmartCare(validConfig);
    var validHandlers = {
        onSuccess: function(rsp) { },
        onError: function(err) { }
    };
    var validBody = {
        ID: 'un',
        Password: 'pw',
        AdditionalValuesVersion: '2'
    };

    beforeEach(function() {
        // A Sinon stub replaces the target function, so no need for DI.
        this.post = sinon.stub(request, 'post');
    });
    afterEach(function() {
        request.post.restore();
    });

    badStringValues.forEach(arg => {
        it(`should throw when username is '${arg}'`, function() {
            assert.throws(() => smartcare.login(arg, "pw", validHandlers), Error);
        });
    });
    badStringValues.forEach(arg => {
        it(`should throw when password is '${arg}'`, function() {
            assert.throws(() => smartcare.login("un", arg, validHandlers), Error);
        });
    });
    it(`should throw without login endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.login;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.login("un", "pw", validHandlers), Error);
    });
    it(`should throw when handlers are undefined`, function() {
        assert.throws(() => smartcare.login("un", "pw"), Error);
    });
    it(`should throw when handlers are null`, function() {
        assert.throws(() => smartcare.login("un", "pw", null), Error);
    });
    Object.keys(validHandlers).forEach(hand => {
        it(`should throw when ${hand} handler is missing`, function() {
            let invalidHandlers = Object.assign({}, validHandlers);
            delete invalidHandlers[hand];
            assert.throws(() => smartcare.login("un", "pw", invalidHandlers), Error);
        });
    });
    Object.keys(validHandlers).forEach(hand => {
        badHandlerValues.forEach(val => {
            it(`should throw when ${hand} handler is '${val}'`, function() {
                let invalidHandlers = Object.assign({}, validHandlers);
                invalidHandlers[hand] = val;
                assert.throws(() => smartcare.login("un", "pw", invalidHandlers), Error);
            });
        });
    });
    describe('initial request', function() {
        [
            { key: 'url', val: validConfig.endpoints.login },
        ].forEach(opt => {
            it(`should get configured ${opt.key}`, function() {
                smartcare.login("un", "pw", validHandlers);
                assert.equal(this.post.firstCall.args[0][opt.key], opt.val);
            });
        });
        it(`should enable json`, function() {
            smartcare.login("un", "pw", validHandlers);
            assert(this.post.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function() {
                smartcare.login("un", "pw", validHandlers);
                assert.equal(this.post.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function() {
            smartcare.login("un", "pw", validHandlers);
            assert(this.post.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
        Object.keys(validBody).forEach(key => {
            it(`should put ${key} property in body`, function() {
                smartcare.login("un", "pw", validHandlers);
                assert.equal(this.post.firstCall.args[0]['json'][key], validBody[key]);
            });
        });
    });
    describe('initial response', function() {
        it(`should call onError on error`, function(done) {
            var err = new Error('aaa');
            this.post.callsArgWith(1, err);

            validHandlers.onError = err => {
                assert.equal(err.message, 'aaa');
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
        it(`should call onError on missing WWW-Authenticate`, function(done) {
            var rsp = { headers: { "Other-Header": 'value' } }
            this.post.callsArgWith(1, null, rsp);

            validHandlers.onError = err => {
                assert(err.message.startsWith('Challenge'));
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
        it(`should call onError on wrong WWW-Authenticate type`, function(done) {
            var rsp = { headers: { "WWW-Authenticate": 'Basic realm="sc.com"' } }
            this.post.callsArgWith(1, null, rsp);

            validHandlers.onError = err => {
                assert(err.message.startsWith('Challenge'));
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
    });
    describe('final request', function() {
        var validFirstResponse = { headers: { "WWW-Authenticate": "T3Auth aaa" } };

        beforeEach(function() {
            this.post.callsArgWith(1, null, validFirstResponse);
        });

        [
            'X-SpeechCycle-SmartCare-SessionID',
            'X-SpeechCycle-SmartCare-CustomerID',
            'X-SpeechCycle-SmartCare-ApplicationID',
        ].forEach(hdr => {
            it(`should POST with same ${hdr} header`, function(done) {
                validHandlers.onError = err => { done(); };
                smartcare.login("un", "pw", validHandlers);

                assert.equal(this.post.secondCall.args[0]['headers'][hdr], this.post.firstCall.args[0]['headers'][hdr]);
            });
        });
        it(`should POST with Authorization header`, function (done) {
            var config = validConfig.clone();
            config.sessionId = '15344b6f-2131-2fa9-994e-c69103be9859';
            var scclient = new SmartCare(config);
            validHandlers.onError = err => { done(); };
            scclient.login("un", "pw", validHandlers);

            var expected = rsp.headers["WWW-Authenticate"] + ', token="IX2y+8igk6nCN3iAw77tPoOTx74="';
            assert.equal(this.post.secondCall.args[0]['headers']['Authorization'], expected);
        });
        [
            'WWW-Authenticate', 'www-authenticate'
        ].forEach(hdr => {
            it(`should POST with Authorization header from ${hdr} header`, function(done) {
                var rsp = { headers: {} };
                rsp.headers[hdr] = "T3Auth aaa"
                this.post.callsArgWith(1, null, rsp);

                validHandlers.onError = err => { done(); };
                smartcare.login("un", "pw", validHandlers);

                assert(this.post.secondCall.args[0]['headers']['Authorization'].startsWith(rsp.headers.hdr));
            });
        });
        Object.keys(validBody).forEach(key => {
            it(`should put ${key} property in body`, function(done) {
                validHandlers.onError = err => { done(); };
                smartcare.login("un", "pw", validHandlers);

                assert.equal(this.post.secondCall.args[0]['json'][key], validBody[key]);
            });
        });
    });
    describe('final response', function() {
        var validFirstResponse = { headers: { "WWW-Authenticate": "T3Auth aaa" } };

        beforeEach(function() {
            this.post.callsArgWith(1, null, validFirstResponse);
        });

        it(`should call onError on error`, function(done) {
            var err = new Error('aaa');
            this.post.onSecondCall().callsArgWith(1, err);

            validHandlers.onError = err => {
                assert.equal(err.message, 'aaa');
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
        it(`should call onError on non-200 status code`, function(done) {
            var rsp = { statusCode: 400 }
            this.post.onSecondCall().callsArgWith(1, null, rsp);

            validHandlers.onError = err => {
                assert.equal(err.message, 'Authentication failed');
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
        it(`should call onSuccess on with message body`, function(done) {
            var rsp = { statusCode: 200 };
            var body = { test: 'aaa' };
            this.post.onSecondCall().callsArgWith(1, null, rsp, body);

            validHandlers.onSuccess = rsp => {
                assert.equal(rsp.test, 'aaa');
                done();
            };
            smartcare.login("un", "pw", validHandlers);
        });
        it(`should call onSuccess in verbose mode`, function(done) {
            var config = validConfig.clone();
            config.verbose = true;
            var t3client = new SmartCare(config);
            var rsp = { statusCode: 200 };
            var body = { test: 'aaa' };
            this.post.onSecondCall().callsArgWith(1, null, rsp, body);

            validHandlers.onSuccess = rsp => {
                assert.equal(rsp.test, 'aaa');
                done();
            };
            t3client.login("un", "pw", validHandlers);
        });
    });
});

describe('isAuthenticated', function () {
    var smartcare = new SmartCare(validConfig);
    var validHandlers = {
        onSuccess: function (rsp) { },
        onError: function (err) { }
    };
    var validFirstResponse = { headers: { "WWW-Authenticate": "T3Auth aaa" } };
    var validSecondResponse = { statusCode: 200 };

    beforeEach(function () {
        // A Sinon stub replaces the target function, so no need for DI.
        this.post = sinon.stub(request, 'post');
        this.post.callsArgWith(1, null, validFirstResponse);
    });
    afterEach(function () {
        request.post.restore();
    });

    it('should be false before login', function () {
        assert(!smartcare.isAuthenticated);
    });
    it(`should be false when T3Token is undefined`, function (done) {
        var body = { test: 'aaa' };
        this.post.onSecondCall().callsArgWith(1, null, validSecondResponse, body);

        validHandlers.onSuccess = rsp => { done(); };
        smartcare.login("un", "pw", validHandlers);

        assert(!smartcare.isAuthenticated);
    });
    [null, ""].forEach(val => {
        it(`should be false when T3Token is '${val}'`, function (done) {
            var body = { test: 'aaa' };
            this.post.onSecondCall().callsArgWith(1, null, validSecondResponse, body);

            validHandlers.onSuccess = rsp => { done(); };
            smartcare.login("un", "pw", validHandlers);

            assert(!smartcare.isAuthenticated);
        });
    });
    it(`should be true when T3Token is non-empty`, function (done) {
        var body = { T3Token: 'aaa' };
        this.post.onSecondCall().callsArgWith(1, null, validSecondResponse, body);

        validHandlers.onSuccess = rsp => { done(); };
        smartcare.login("un", "pw", validHandlers);

        assert(smartcare.isAuthenticated);
    });
});

describe('hasActions', function () {
    var smartcare = new SmartCare(validConfig);
    var validHandlers = {
        onSuccess: function (rsp) { },
        onError: function (err) { }
    };
    var validResponse = { statusCode: 200 };
    var validBody = {
        ServiceItems: [{
            "Action": "Home_Dashboard",
        }],
        Actions: [{
            "Name": "Home_Dashboard",
        }]
    }

    beforeEach(function () {
        // A Sinon stub replaces the target function, so no need for DI.
        this.get = sinon.stub(request, 'get');
    });
    afterEach(function () {
        request.get.restore();
    });

    it('should be false before refreshTouchmap', function () {
        assert(!smartcare.hasActions);
    });
    it(`should be true when actions are present`, function (done) {
        this.get.callsArgWith(1, null, validResponse, validBody);

        validHandlers.onSuccess = rsp => { done(); };
        smartcare.refreshTouchmap(validHandlers);

        assert(smartcare.hasActions);
    });
});

describe('refreshTouchmap()', function() {
    var smartcare = new SmartCare(validConfig);
    var validHandlers = {
        onSuccess: function(rsp) { },
        onError: function(err) { }
    };

    beforeEach(function() {
        this.get = sinon.stub(request, 'get');
    });
    afterEach(function() {
        request.get.restore();
    });

    it(`should throw without search endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.search;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.refreshTouchmap(validHandlers), Error);
    });
    it(`should throw when handlers are undefined`, function() {
        assert.throws(() => smartcare.refreshTouchmap(), Error);
    });
    it(`should throw when handlers are null`, function() {
        assert.throws(() => smartcare.refreshTouchmap(null), Error);
    });
    Object.keys(validHandlers).forEach(hand => {
        it(`should throw when ${hand} handler is missing`, function() {
            let invalidHandlers = Object.assign({}, validHandlers);
            delete invalidHandlers[hand];
            assert.throws(() => smartcare.refreshTouchmap(invalidHandlers), Error);
        });
    });
    Object.keys(validHandlers).forEach(hand => {
        badHandlerValues.forEach(val => {
            it(`should throw when ${hand} handler is '${val}'`, function() {
                let invalidHandlers = Object.assign({}, validHandlers);
                invalidHandlers[hand] = val;
                assert.throws(() => smartcare.refreshTouchmap(invalidHandlers), Error);
            });
        });
    });
    describe('request', function() {
        it(`should get configured url`, function() {
            smartcare.refreshTouchmap(validHandlers);
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/touch-map');
        });
        it(`should enable json`, function() {
            smartcare.refreshTouchmap(validHandlers);
            assert(this.get.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function() {
                smartcare.refreshTouchmap(validHandlers);
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function() {
            smartcare.refreshTouchmap(validHandlers);
            assert(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
    });
    describe('response', function () {
        var validBody = {
            QueryMaps: null,
            ServiceItems: [{
                "Action": "Home_Dashboard",
            }],
            Actions: [{
                "Name": "Home_Dashboard",
            }]
        }
        beforeEach(function () {
            delete smartcare.menu;
            delete smartcare.actions;
        });

        it(`should call onError on error`, function(done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            validHandlers.onError = err => {
                assert.equal(err.message, 'aaa');
                done();
            };
            smartcare.refreshTouchmap(validHandlers);
        });
        it(`should call onError on non-200 status code`, function(done) {
            var rsp = { statusCode: 400 }
            this.get.callsArgWith(1, null, rsp);

            validHandlers.onError = err => {
                assert.equal(err.message, 'Touchmap refresh failed');
                done();
            };
            smartcare.refreshTouchmap(validHandlers);
        });
        it(`should call onSuccess on 200 OK`, function (done) {
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            validHandlers.onSuccess = rsp => { done(); };
            smartcare.refreshTouchmap(validHandlers);
        });
        it(`should call onSuccess in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            validHandlers.onSuccess = rsp => { done(); };
            scclient.refreshTouchmap(validHandlers);
        });
        it(`should save Actions`, function (done) {
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            validHandlers.onSuccess = rsp => { done(); };
            smartcare.refreshTouchmap(validHandlers);

            assert(smartcare.hasActions);
        });
    });
});

describe('search()', function () {
    var smartcare = new SmartCare(validConfig);
    var validHandlers = {
        onSuccess: function (rsp) { },
        onError: function (err) { }
    };
    var validActions = {
        refreshTime: new Date(),
        "Home_Dashboard": {
            "Name": "Home_Dashboard",
        }
    };
    var validBody = {
        Results: [{
            Action: "Home_Dashboard"
        }]
    };

    beforeEach(function () {
        this.get = sinon.stub(request, 'get');
        smartcare.actions = validActions;
    });
    afterEach(function () {
        request.get.restore();
    });

    it(`should throw without search endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.search;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.search('query', validHandlers), Error);
    });
    badStringValues.forEach(arg => {
        it(`should throw when query is '${arg}'`, function () {
            assert.throws(() => smartcare.search(arg, validHandlers), Error);
        });
    });
    it(`should throw when handlers are undefined`, function () {
        assert.throws(() => smartcare.search('query'), Error);
    });
    it(`should throw when handlers are null`, function () {
        assert.throws(() => smartcare.search('query', null), Error);
    });
    Object.keys(validHandlers).forEach(hand => {
        it(`should throw when ${hand} handler is missing`, function () {
            let invalidHandlers = Object.assign({}, validHandlers);
            delete invalidHandlers[hand];
            assert.throws(() => smartcare.search('query', invalidHandlers), Error);
        });
    });
    Object.keys(validHandlers).forEach(hand => {
        badHandlerValues.forEach(val => {
            it(`should throw when ${hand} handler is '${val}'`, function () {
                let invalidHandlers = Object.assign({}, validHandlers);
                invalidHandlers[hand] = val;
                assert.throws(() => smartcare.search('query', invalidHandlers), Error);
            });
        });
    });
    it(`should refresh touchmap when hasActions is false`, function () {
        delete smartcare.actions;
        smartcare.search('query', validHandlers);
        assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/touch-map');
    });
    it(`should call onError when refreshTouchmap fails`, function (done) {
        delete smartcare.actions;
        var err = new Error('aaa');
        this.get.onFirstCall().callsArgWith(1, err);

        validHandlers.onError = err => {
            assert.equal(err.message, 'aaa');
            done();
        };
        smartcare.search('query', validHandlers);
    });
    it(`should perform search after refreshTouchmap`, function (done) {
        delete smartcare.actions;
        var validBody = {
            QueryMaps: null,
            ServiceItems: [{ "Action": "Home_Dashboard", }],
            Actions: [{ "Name": "Home_Dashboard", }]
        }
        var err = new Error('aaa');
        this.get.onFirstCall().callsArgWith(1, null, { statusCode: 200 }, validBody);
        this.get.onSecondCall().callsArgWith(1, err);

        validHandlers.onError = err => {
            assert.equal(err.message, 'aaa');
            done();
        };
        smartcare.search('query', validHandlers);
    });
    it(`should skip refresh when hasActions is false`, function () {
        smartcare.search('query', validHandlers);
        assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/simple');
    });
    describe('request', function () {
        it(`should get configured url`, function () {
            smartcare.search('query', validHandlers);
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/simple');
        });
        it(`should enable json`, function () {
            smartcare.search('query', validHandlers);
            assert(this.get.firstCall.args[0].json);
        });
        it(`should add query string`, function () {
            smartcare.search('query', validHandlers);
            assert.equal(this.get.firstCall.args[0].qs.text, 'query');
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function () {
                smartcare.search('query', validHandlers);
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function () {
            smartcare.search('query', validHandlers);
            assert(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
    });
    describe('response', function (done) {
        var validResponse = { statusCode: 200 }

        it(`should call onError on error`, function (done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            validHandlers.onError = err => {
                assert.equal(err.message, 'aaa');
                done();
            };
            smartcare.search('query', validHandlers);
        });
        it(`should call onError on non-200 status code`, function (done) {
            var rsp = { statusCode: 400 };
            this.get.callsArgWith(1, null, rsp);

            validHandlers.onError = err => {
                assert.equal(err.message, 'Search failed');
                done();
            };
            smartcare.search('query', validHandlers);
        });
        it(`should call onSuccess on 200 OK`, function (done) {
            this.get.callsArgWith(1, null, validResponse, validBody);

            validHandlers.onSuccess = rsp => { done(); };
            smartcare.search('query', validHandlers);
        });
        it(`should call onSuccess in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            scclient.actions = validActions;
            this.get.callsArgWith(1, null, validResponse, validBody);

            validHandlers.onSuccess = rsp => { done(); };
            scclient.search('query', validHandlers);
        });
        it(`should call onSuccess with results`, function (done) {
            this.get.callsArgWith(1, null, validResponse, validBody);

            validHandlers.onSuccess = rsp => {
                assert(rsp.Results.length > 0);
                done();
            };
            smartcare.search('query', validHandlers);
        });
        it(`should populate results with action objects`, function (done) {
            this.get.callsArgWith(1, null, validResponse, validBody);

            validHandlers.onSuccess = rsp => {
                assert.equal(typeof rsp.Results[0].Action, 'object');
                done();
            };
            smartcare.search('query', validHandlers);
        });
    });
});
