var assert = require('assert');
var sinon = require('sinon');
var request = require('request');
var SmartCare = require('../index');

var validConfig = {
    endpoints: {
        login: 'https://t3.sc.com/path',
        signin: 'https://t3.sc.com/path',
        search: 'https://s.sc.com/path',
        account: 'https://a.sc.com/path'
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
            assert.throws(() => smartcare.login(arg, 'pw'), Error);
        });
    });
    badStringValues.forEach(arg => {
        it(`should throw when password is '${arg}'`, function() {
            assert.throws(() => smartcare.login('un', arg), Error);
        });
    });
    ['login', 'signin'].forEach(ep => {
        it(`should throw without ${ep} endpoint`, function () {
            var config = validConfig.clone();
            delete config.endpoints[ep];
            var scclient = new SmartCare(config);
            assert.throws(() => scclient.login('un', 'pw'), Error);
        });
    });
    it(`should throw when callback is wrong type`, function() {
        assert.throws(() => smartcare.login('un', 'pw', 'string'), Error);
    });
    describe('initial request', function() {
        [
            { key: 'url', val: validConfig.endpoints.login },
        ].forEach(opt => {
            it(`should get configured ${opt.key}`, function() {
                smartcare.login('un', 'pw');
                assert.equal(this.post.firstCall.args[0][opt.key], opt.val);
            });
        });
        it(`should enable json`, function() {
            smartcare.login('un', 'pw');
            assert(this.post.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function() {
                smartcare.login('un', 'pw');
                assert.equal(this.post.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function() {
            smartcare.login('un', 'pw');
            assert(this.post.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
        Object.keys(validBody).forEach(key => {
            it(`should put ${key} property in body`, function() {
                smartcare.login('un', 'pw');
                assert.equal(this.post.firstCall.args[0]['json'][key], validBody[key]);
            });
        });
    });
    describe('initial response', function() {
        it(`should include error argument on error`, function(done) {
            var err = new Error('aaa');
            this.post.callsArgWith(1, err);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on missing WWW-Authenticate`, function(done) {
            var rsp = { headers: { "Other-Header": 'value' } }
            this.post.callsArgWith(1, null, rsp);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(err.message.startsWith('Challenge'));
                done();
            });
        });
        it(`should include error argument on wrong WWW-Authenticate type`, function(done) {
            var rsp = { headers: { "WWW-Authenticate": 'Basic realm="sc.com"' } }
            this.post.callsArgWith(1, null, rsp);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(err.message.startsWith('Challenge'));
                done();
            });
        });
    });
    describe('second request', function() {
        var validFirstResponse = { headers: { 'WWW-Authenticate': 'T3Auth aaa' } };

        beforeEach(function() {
            this.post.callsArgWith(1, null, validFirstResponse);
        });

        [
            'X-SpeechCycle-SmartCare-SessionID',
            'X-SpeechCycle-SmartCare-CustomerID',
            'X-SpeechCycle-SmartCare-ApplicationID',
        ].forEach(hdr => {
            it(`should POST with same ${hdr} header`, function(done) {
                smartcare.login('un', 'pw', (err, rsp) => { done(); });

                assert.equal(this.post.secondCall.args[0]['headers'][hdr], this.post.firstCall.args[0]['headers'][hdr]);
            });
        });
        it(`should POST with Authorization header`, function (done) {
            var config = validConfig.clone();
            config.sessionId = '15344b6f-2131-2fa9-994e-c69103be9859';
            var scclient = new SmartCare(config);
            scclient.login('un', 'pw', (err, rsp) => { done(); });

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

                smartcare.login('un', 'pw', (err, rsp) => { done(); });

                assert(this.post.secondCall.args[0]['headers']['Authorization'].startsWith(rsp.headers.hdr));
            });
        });
        Object.keys(validBody).forEach(key => {
            it(`should put ${key} property in body`, function(done) {
                smartcare.login('un', 'pw', (err, rsp) => { done(); });

                assert.equal(this.post.secondCall.args[0]['json'][key], validBody[key]);
            });
        });
    });
    describe('second response', function() {
        var validFirstResponse = { headers: { 'WWW-Authenticate': 'T3Auth aaa' } };

        beforeEach(function() {
            this.post.callsArgWith(1, null, validFirstResponse);
        });

        it(`should include error argument on error`, function(done) {
            var err = new Error('aaa');
            this.post.onSecondCall().callsArgWith(1, err);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-200 status code`, function(done) {
            var rsp = { statusCode: 400 }
            this.post.onSecondCall().callsArgWith(1, null, rsp);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'Authentication failed');
                done();
            });
        });
    });
    describe('forms signin request', function () {
        var validFirstResponse = { headers: { 'WWW-Authenticate': 'T3Auth aaa' } };
        var validSecondBody = { Value: '1234', T3Token: 'aaa', AdditionalValues: [1, 2] };

        beforeEach(function () {
            this.post.onFirstCall().callsArgWith(1, null, validFirstResponse);
            this.post.onSecondCall().callsArgWith(1, null, { statusCode: 200 }, validSecondBody);
        });

        [
            { key: 'url', val: validConfig.endpoints.signin },
        ].forEach(opt => {
            it(`should get configured ${opt.key}`, function () {
                smartcare.login('un', 'pw', (err, rsp) => {
                    assert.equal(this.post.thirdCall.args[0][opt.key], opt.val);
                    done();
                });
            });
        });
        [
            { name: 's_customerId', val: validConfig.customer },
            { name: 's_applicationId', val: validConfig.app },
            { name: 's_userId', val: '1234' },
            { name: 's_userName', val: '1234' },
            { name: 's_userData', val: '1234' },
            { name: 's_t3token', val: 'aaa' },
            { name: 's_platform', val: '' },
            { name: 's_applicationVersion', val: '2' },
            { name: 's_additionalValues', val: '1,2' }
        ].forEach(param => {
            it(`should POST with ${param.name} in body`, function (done) {
                smartcare.login('un', 'pw', (err, rsp) => {
                    assert.equal(this.post.thirdCall.args[0]['form'][param.name], param.val);
                    done();
                });
            });
        });
        it(`should POST with s_sessionId in body`, function (done) {
            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(this.post.thirdCall.args[0]['form']['s_sessionId'],
                    this.post.secondCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID']);
                done();
            });
        });
        it(`should POST with Accept header`, function (done) {
            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(this.post.thirdCall.args[0]['headers']['Accept'], 'application/json');
                done();
            });

        });
    });
    describe('forms signin response', function () {
        var validFirstResponse = { headers: { 'WWW-Authenticate': 'T3Auth aaa' } };
        var validSecondBody = { Value: '1234', T3Token: 'aaa', AdditionalValues: [1, 2] };
        var validThirdResponse = { statusCode: 302, headers: { 'Location': '/test' } };

        beforeEach(function () {
            this.post.onFirstCall().callsArgWith(1, null, validFirstResponse);
            this.post.onSecondCall().callsArgWith(1, null, { statusCode: 200 }, validSecondBody);
        });

        it(`should include error argument on error`, function (done) {
            var err = new Error('aaa');
            this.post.onThirdCall().callsArgWith(1, err);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-302 status code`, function (done) {
            var rsp = { statusCode: 400 }
            this.post.onThirdCall().callsArgWith(1, null, rsp);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'Signin protocol error');
                done();
            });
        });
        it(`should include error argument on forbidden Location`, function (done) {
            var rsp = { statusCode: 302, headers: { 'Location': '/test/forbidden/test' } };
            this.post.onThirdCall().callsArgWith(1, null, rsp);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert.equal(err.message, 'Signin failed');
                done();
            });
        });
        it(`should set dashboard endpoint from signin endpoint on success`, function (done) {
            this.post.onThirdCall().callsArgWith(1, null, validThirdResponse);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(validConfig.endpoints.dashboard.startsWith('https://t3.sc.com'));
                done();
            });
        });
        it(`should set dashboard endpoint without signin endpoint path on success`, function (done) {
            this.post.onThirdCall().callsArgWith(1, null, validThirdResponse);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(!validConfig.endpoints.dashboard.contains('path'));
                done();
            });
        });
        it(`should include Location in dashboard endpoint on success`, function (done) {
            this.post.onThirdCall().callsArgWith(1, null, validThirdResponse);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(validConfig.endpoints.dashboard.endsWith(validThirdResponse.headers['Location']));
                done();
            });
        });
        it(`should succeed with message body`, function (done) {
            this.post.onThirdCall().callsArgWith(1, null, validThirdResponse);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var t3client = new SmartCare(config);
            this.post.onThirdCall().callsArgWith(1, null, validThirdResponse);

            t3client.login('un', 'pw', (err, rsp) => {
                assert(!err);
                done();
            });
        });
    });});

describe('isAuthenticated', function () {
    var smartcare = new SmartCare(validConfig);
    var validFirstResponse = { headers: { 'WWW-Authenticate': 'T3Auth aaa' } };
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

        smartcare.login('un', 'pw', (err, rsp) => {
            assert(!smartcare.isAuthenticated);
            done();
        });
    });
    [null, ""].forEach(val => {
        it(`should be false when T3Token is '${val}'`, function (done) {
            var body = { test: 'aaa' };
            this.post.onSecondCall().callsArgWith(1, null, validSecondResponse, body);

            smartcare.login('un', 'pw', (err, rsp) => {
                assert(!smartcare.isAuthenticated);
                done();
            });
        });
    });
    it(`should be true when T3Token is non-empty`, function (done) {
        var body = { T3Token: 'aaa' };
        this.post.onSecondCall().callsArgWith(1, null, validSecondResponse, body);

        smartcare.login('un', 'pw', (err, rsp) => {
            assert(smartcare.isAuthenticated);
            done();
        });

    });
});

describe('hasActions', function () {
    var smartcare = new SmartCare(validConfig);
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

        smartcare.refreshTouchmap((err, rsp) => {
            assert(smartcare.hasActions);
            done();
        });
    });
});

describe('hasMenu', function () {
    var smartcare = new SmartCare(validConfig);
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
        assert(!smartcare.hasMenu);
    });
    it(`should be true when actions are present`, function (done) {
        this.get.callsArgWith(1, null, validResponse, validBody);

        smartcare.refreshTouchmap((err, rsp) => {
            assert(smartcare.hasMenu);
            done();
        });
    });
});

describe('refreshTouchmap()', function() {
    var smartcare = new SmartCare(validConfig);

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
        assert.throws(() => scclient.refreshTouchmap(), Error);
    });
    it(`should throw when callback is wrong type`, function() {
        assert.throws(() => smartcare.refreshTouchmap('string'), Error);
    });
    describe('request', function() {
        it(`should get configured url`, function() {
            smartcare.refreshTouchmap();
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/touch-map');
        });
        it(`should enable json`, function() {
            smartcare.refreshTouchmap();
            assert(this.get.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function() {
                smartcare.refreshTouchmap();
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function() {
            smartcare.refreshTouchmap();
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

        it(`should include error argument on error`, function(done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            smartcare.refreshTouchmap((err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-200 status code`, function(done) {
            var rsp = { statusCode: 400 }
            this.get.callsArgWith(1, null, rsp);

            smartcare.refreshTouchmap((err, rsp) => {
                assert.equal(err.message, 'Touchmap refresh failed');
                done();
            });
        });
        it(`should succeed on 200 OK`, function (done) {
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            smartcare.refreshTouchmap((err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            scclient.refreshTouchmap((err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should save Actions`, function (done) {
            var rsp = { statusCode: 200 }
            this.get.callsArgWith(1, null, rsp, validBody);

            smartcare.refreshTouchmap((err, rsp) => {
                assert(smartcare.hasActions);
                done();
            });
        });
    });
});

describe('search()', function () {
    var smartcare = new SmartCare(validConfig);

    beforeEach(function () {
        this.get = sinon.stub(request, 'get');
    });
    afterEach(function () {
        request.get.restore();
    });

    it(`should throw without search endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.search;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.search('query'), Error);
    });
    badStringValues.forEach(arg => {
        it(`should throw when query is '${arg}'`, function () {
            assert.throws(() => smartcare.search(arg), Error);
        });
    });
    it(`should throw when callback is wrong type`, function () {
        assert.throws(() => smartcare.search('query', 'string'), Error);
    });
    describe('request', function () {
        it(`should get configured url`, function () {
            smartcare.search('query');
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.search + '/simple');
        });
        it(`should enable json`, function () {
            smartcare.search('query');
            assert(this.get.firstCall.args[0].json);
        });
        it(`should add query string`, function () {
            smartcare.search('query');
            assert.equal(this.get.firstCall.args[0].qs.text, 'query');
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function () {
                smartcare.search('query');
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function () {
            smartcare.search('query');
            assert(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
    });
    describe('response', function (done) {
        var validResponse = { statusCode: 200 }

        it(`should include error argument on error`, function (done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            smartcare.search('query', (err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-200 status code`, function (done) {
            var rsp = { statusCode: 400 };
            this.get.callsArgWith(1, null, rsp);

            smartcare.search('query', (err, rsp) => {
                assert.equal(err.message, 'Search failed');
                done();
            });
        });
        it(`should succeed on 200 OK`, function (done) {
            this.get.callsArgWith(1, null, validResponse, {});

            smartcare.search('query', (err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            this.get.callsArgWith(1, null, validResponse, {});

            scclient.search('query', (err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed with results`, function (done) {
            this.get.callsArgWith(1, null, validResponse, { expected: true });

            smartcare.search('query', (err, rsp) => {
                assert(rsp.expected);
                done();
            });
        });
    });
});

describe('getAccount()', function () {
    var smartcare = new SmartCare(validConfig);

    beforeEach(function () {
        this.get = sinon.stub(request, 'get');
        smartcare.auth = { T3Token: '1234' };
    });
    afterEach(function () {
        request.get.restore();
    });

    it(`should throw without account endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.account;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.getAccount(), Error);
    });
    it(`should throw when callback is wrong type`, function () {
        assert.throws(() => smartcare.getAccount('string'), Error);
    });
    it(`should throw when not authenticated`, function () {
        smartcare.auth = null;
        assert.throws(() => smartcare.getAccount(), Error);
    });
    describe('request', function () {
        it(`should get configured url`, function () {
            smartcare.getAccount();
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.account + '/account/get-by-number');
        });
        it(`should enable json`, function () {
            smartcare.getAccount();
            assert(this.get.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function () {
                smartcare.getAccount();
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function () {
            smartcare.getAccount();
            assert(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
    });
    describe('response', function (done) {
        var validResponse = { statusCode: 200 }

        it(`should include error argument on error`, function (done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            smartcare.getAccount((err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-200 status code`, function (done) {
            var rsp = { statusCode: 400 };
            this.get.callsArgWith(1, null, rsp);

            smartcare.getAccount((err, rsp) => {
                assert.equal(err.message, 'Account lookup failed');
                done();
            });
        });
        it(`should succeed on 200 OK`, function (done) {
            this.get.callsArgWith(1, null, validResponse, {});

            smartcare.getAccount((err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            scclient.auth = { T3Token: '1234' };
            this.get.callsArgWith(1, null, validResponse, {});

            scclient.getAccount((err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed with results`, function (done) {
            this.get.callsArgWith(1, null, validResponse, { expected: true });

            smartcare.getAccount((err, rsp) => {
                assert(rsp.expected);
                done();
            });
        });
    });
});

describe('getStatements()', function () {
    var smartcare = new SmartCare(validConfig);
    var validAuth = {
        T3Token: '1234',
        Value: 'value'
    };

    beforeEach(function () {
        this.get = sinon.stub(request, 'get');
        smartcare.auth = validAuth;
    });
    afterEach(function () {
        request.get.restore();
    });

    it(`should throw when count is undefined`, function () {
        assert.throws(() => smartcare.getStatements(), Error);
    });
    ['a string', -1, 0].forEach(count => {
        it(`should throw when count is ${count}`, function () {
            assert.throws(() => smartcare.getStatements(count, false), Error);
        });
    });
    it(`should throw when pdf is undefined`, function () {
        assert.throws(() => smartcare.getStatements(1), Error);
    });
    it(`should throw when pdf is wrong type`, function () {
        assert.throws(() => smartcare.getStatements(1, 'string'), Error);
    });
    it(`should throw without account endpoint`, function () {
        var config = validConfig.clone();
        delete config.endpoints.account;
        var scclient = new SmartCare(config);
        assert.throws(() => scclient.getStatements(1, false), Error);
    });
    it(`should throw when callback is wrong type`, function () {
        assert.throws(() => smartcare.getStatements(1, false, 'string'), Error);
    });
    it(`should throw when not authenticated`, function () {
        smartcare.auth = null;
        assert.throws(() => smartcare.getStatements(1, false), Error);
    });
    describe('request', function () {
        it(`should get configured url`, function () {
            smartcare.getStatements(1, false);
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.account + '/bill/1');
        });
        it(`should use pdf endpoint`, function () {
            smartcare.getStatements(1, true);
            assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.account + '/pdf-statement/1');
        });
        [2, 3].forEach(count => {
            it(`should change endpoint when count is ${count}`, function () {
                smartcare.getStatements(count, false);
                assert.equal(this.get.firstCall.args[0].url, validConfig.endpoints.account + '/bill/' + count);
            });
        });
        it(`should enable json`, function () {
            smartcare.getStatements(1, false);
            assert(this.get.firstCall.args[0].json);
        });
        [
            { name: 'X-SpeechCycle-SmartCare-CustomerID', val: validConfig.customer },
            { name: 'X-SpeechCycle-SmartCare-ApplicationID', val: validConfig.app },
            { name: 'X-SpeechCycle-SmartCare-UserID', val: validAuth.Value },
            { name: 'X-SpeechCycle-SmartCare-UserName', val: validAuth.Value },
            { name: 'X-SpeechCycle-SmartCare-T3Token', val: validAuth.T3Token }
        ].forEach(opt => {
            it(`should get HTTP header ${opt.name}`, function () {
                smartcare.getStatements(1, false);
                assert.equal(this.get.firstCall.args[0]['headers'][opt.name], opt.val);
            });
        });
        it(`should get HTTP header X-SpeechCycle-SmartCare-AdditionalValues when values are present`, function () {
            Object.assign(smartcare.auth, { AdditionalValues: [1] });
            smartcare.getStatements(1, false);
            assert.equal(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-AdditionalValues'], '1');
        });
        it(`should get HTTP header X-SpeechCycle-SmartCare-AdditionalValues when multiple values are present`, function () {
            Object.assign(smartcare.auth, { AdditionalValues: [1,2,3] });
            smartcare.getStatements(1, false);
            assert.equal(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-AdditionalValues'], '1,2,3');
        });
        it(`should get GUID in HTTP header X-SpeechCycle-SmartCare-SessionID`, function () {
            smartcare.getStatements(1, false);
            assert(this.get.firstCall.args[0]['headers']['X-SpeechCycle-SmartCare-SessionID'].match(/[0-9A-F]{8}-?([0-9A-F]{4}-?){3}-?[0-9A-F]{12}/i));
        });
    });
    describe('response', function (done) {
        var validResponse = { statusCode: 200 }

        it(`should include error argument on error`, function (done) {
            var err = new Error('aaa');
            this.get.callsArgWith(1, err);

            smartcare.getStatements(1, false, (err, rsp) => {
                assert.equal(err.message, 'aaa');
                done();
            });
        });
        it(`should include error argument on non-200 status code`, function (done) {
            var rsp = { statusCode: 400 };
            this.get.callsArgWith(1, null, rsp);

            smartcare.getStatements(1, false, (err, rsp) => {
                assert.equal(err.message, 'Statement lookup failed');
                done();
            });
        });
        it(`should succeed on 200 OK`, function (done) {
            this.get.callsArgWith(1, null, validResponse, {});

            smartcare.getStatements(1, false, (err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed in verbose mode`, function (done) {
            var config = validConfig.clone();
            config.verbose = true;
            var scclient = new SmartCare(config);
            scclient.auth = validAuth;
            this.get.callsArgWith(1, null, validResponse, {});

            scclient.getStatements(1, false, (err, rsp) => {
                assert(!err);
                done();
            });
        });
        it(`should succeed with results`, function (done) {
            this.get.callsArgWith(1, null, validResponse, { expected: true });

            smartcare.getStatements(1, false, (err, rsp) => {
                assert(!err);
                assert(rsp.expected);
                done();
            });
        });
    });
});
