var LSE_logger = require('LSE_logger');
var config = require('../config').config;
var redis = require('./redis');
var userLib = require('./user');
var url = require('url');
var pd = require('pretty-data').pd;
var st = require('shiro-trie');
module.exports = comm;
function comm(req, res, reqBody, authResult)
{
    this.req = req;
    this.reqBody = reqBody;
    this.res = res;
    this.resBody = "";
    this.authResult = authResult || null;
    this.sessionId = null;
    if(authResult && authResult.success)
    {
        this.user = new userLib.user(authResult.username);
        this.sessionId = this.generateSessionId();
        this.initializeSession();
    }
    else
    {
        var header = req.headers['authorization'] || '';
        var token = header.split(/\s+/).pop() || '';
        var auth = Buffer.from(token, 'base64').toString();
        var parts = auth.split(/:/);
        var username = parts[0] || 'anonymous';
        this.user = new userLib.user(username);
    }
    this.authority = st.new();
    var arrAuthorisation = config.authorisation;
    for(var i = 0; i < arrAuthorisation.length; i++)
    {
        var el = arrAuthorisation[i];
        this.authority.add(el.replace("$username", this.user.getUserName()));
    }
    return this;
}
comm.prototype.generateSessionId = function()
{
    var crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
};
comm.prototype.initializeSession = function()
{
    if(!this.authResult || !this.authResult.success)
    {
        return;
    }
    var sessionData = {
        username: this.authResult.username,
        authMethod: this.authResult.method,
        createdAt: Math.floor(Date.now() / 1000),
        lastActivity: Math.floor(Date.now() / 1000),
        userAgent: this.req.headers['user-agent'] || '',
        ipAddress: this.req.connection.remoteAddress || this.req.socket.remoteAddress
    };
    if(this.authResult.payload)
    {
        sessionData.jwtPayload = this.authResult.payload;
    }
    redis.setSessionData(this.sessionId, sessionData, 3600).then(function()
    {
        LSE_logger.debug(`[Fennel-NG Session] Session initialized for user: ${sessionData.username}`);
    }).catch(function(error)
    {
        LSE_logger.error(`[Fennel-NG Session] Failed to initialize session: ${error.message}`);
    });
};
comm.prototype.updateSession = function()
{
    if(!this.sessionId)
    {
        return Promise.resolve();
    }
    return redis.getSessionData(this.sessionId).then(function(sessionData)
    {
        if(sessionData)
        {
            sessionData.lastActivity = Math.floor(Date.now() / 1000);
            return redis.setSessionData(this.sessionId, sessionData, 3600);
        }
        return Promise.resolve();
    }).then(function()
    {
        LSE_logger.debug(`[Fennel-NG Session] Session updated for: ${this.sessionId}`);
    }).catch(function(error)
    {
        LSE_logger.error(`[Fennel-NG Session] Failed to update session: ${error.message}`);
    });
};
comm.prototype.destroySession = function()
{
    if(!this.sessionId)
    {
        return Promise.resolve();
    }
    return redis.deleteSessionData(this.sessionId).then(function()
    {
        LSE_logger.debug(`[Fennel-NG Session] Session destroyed: ${this.sessionId}`);
        this.sessionId = null;
    }).catch(function(error)
    {
        LSE_logger.error(`[Fennel-NG Session] Failed to destroy session: ${error.message}`);
    });
};
comm.prototype.pushOptionsResponse = function()
{
    LSE_logger.debug(`[Fennel-NG Comm] pushOptionsResponse called`);
    this.setHeader("Content-Type", "text/html");
    this.setHeader("Server", "Fennel-NG");
    this.setDAVHeaders();
    this.setAllowHeader();
    this.setResponseCode(200);
    this.flushResponse();
};
comm.prototype.setResponseCode = function(responseCode)
{
    LSE_logger.debug(`[Fennel-NG Comm] Setting response code: ${responseCode}`);
    this.res.writeHead(responseCode);
};
comm.prototype.flushResponse = function()
{
    var response = this.resBody;
    if(response.substr(0, 5) === "<?xml")
    {
        response = pd.xml(this.resBody);
    }
    this.updateSession();
    LSE_logger.debug(`[Fennel-NG Comm] Returning response length: ${response.length}`);
    this.res.write(response);
    this.res.end();
};
comm.prototype.appendResBody = function(str)
{
    this.resBody += str;
};
comm.prototype.setStandardHeaders = function()
{
    this.res.setHeader("Content-Type", "application/xml; charset=utf-8");
    this.res.setHeader("Server", "Fennel-NG");
    this.res.setHeader("X-Powered-By", "Fennel-NG CalDAV/CardDAV Server");
    if(this.authResult && this.authResult.method === 'jwt')
    {
        this.res.setHeader("X-Auth-Method", "JWT");
    }
    else
    {
        this.res.setHeader("X-Auth-Method", "Basic");
    }
};
comm.prototype.setDAVHeaders = function()
{
    this.res.setHeader("DAV", "1, 3, extended-mkcol, calendar-access, calendar-schedule, calendar-proxy, calendarserver-sharing, calendarserver-subscribed, addressbook, access-control, calendarserver-principal-property-search");
};
comm.prototype.setAllowHeader = function()
{
    this.res.setHeader("Allow", "OPTIONS, PROPFIND, HEAD, GET, REPORT, PROPPATCH, PUT, DELETE, POST, COPY, MOVE");
};
comm.prototype.setHeader = function(key, value)
{
    this.res.setHeader(key, value);
};
comm.prototype.getUser = function()
{
    return this.user;
};
comm.prototype.getAuthResult = function()
{
    return this.authResult;
};
comm.prototype.getSessionId = function()
{
    return this.sessionId;
};
comm.prototype.getAuthority = function()
{
    return this.authority;
};
comm.prototype.checkPermission = function(strURL, strMethod)
{
    var s = strURL.substr(1).split("/").filter(String).join(":") + ":" + strMethod.toLowerCase();
    var ret = this.authority.check(s);
    LSE_logger.debug(`[Fennel-NG Comm] Checking authority for user '${this.getUser().getUserName()}' for '${s}' with result: ${ret}`);
    return ret;
};
comm.prototype.getReq = function()
{
    return this.req;
};
comm.prototype.getRes = function()
{
    return this.res;
};
comm.prototype.getReqBody = function()
{
    return this.reqBody;
};
comm.prototype.getResBody = function()
{
    return this.resBody;
};
comm.prototype.getURL = function()
{
    return this.req.url;
};
comm.prototype.getURLAsArray = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        LSE_logger.warn(`[Fennel-NG Comm] Something evil happened in comm.getUrlAsArray!`);
        return undefined;
    }
    return aUrl;
};
comm.prototype.getFilenameFromPath = function(removeEnding)
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        LSE_logger.warn(`[Fennel-NG Comm] Something evil happened in request.getFilenameFromPath`);
        return undefined;
    }
    var filename = aUrl[aUrl.length - 1];
    if(removeEnding)
    {
        var lastDotIndex = filename.lastIndexOf('.');
        if(lastDotIndex > 0)
        {
            filename = filename.substr(0, lastDotIndex);
        }
    }
    return filename;
};
comm.prototype.getLastPathElement = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        LSE_logger.warn(`[Fennel-NG Comm] Something evil happened in request.getLastPathElement`);
        return undefined;
    }
    return aUrl[aUrl.length - 2];
};
comm.prototype.getPathElement = function(position)
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        LSE_logger.warn(`[Fennel-NG Comm] Something evil happened in request.getPathElement`);
        return undefined;
    }
    return aUrl[position];
};
comm.prototype.getUrlElementSize = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    return aUrl.length;
};
comm.prototype.stringEndsWith = function(str, suffix)
{
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};
comm.prototype.hasHeader = function(header)
{
    return (this.getHeader(header));
};
comm.prototype.getHeader = function(header)
{
    return this.req.headers[header.toLowerCase()];
};
comm.prototype.getCalIdFromURL = function()
{
    return this.cal;
};
comm.prototype.getCardIdFromURL = function()
{
    return this.card;
};
comm.prototype.getUserIdFromURL = function()
{
    return this.username;
};
comm.prototype.isJWTAuthenticated = function()
{
    return this.authResult && this.authResult.method === 'jwt';
};
comm.prototype.isBasicAuthenticated = function()
{
    return this.authResult && this.authResult.method === 'basic';
};
comm.prototype.getJWTPayload = function()
{
    if(this.authResult && this.authResult.payload)
    {
        return this.authResult.payload;
    }
    return null;
};
comm.prototype.getUserGroups = function()
{
    if(this.authResult && this.authResult.payload && this.authResult.payload.groups)
    {
        return this.authResult.payload.groups;
    }
    return [];
};
comm.prototype.hasGroup = function(groupName)
{
    var groups = this.getUserGroups();
    return groups.includes(groupName);
};
comm.prototype.hasCalDAVAccess = function()
{
    return this.hasGroup(config.auth_method_ldap_required_group);
};
comm.prototype.logRequest = function()
{
    var logData = {
        method: this.req.method,
        url: this.req.url,
        username: this.user.getUserName(),
        authMethod: this.authResult ? this.authResult.method : 'none',
        userAgent: this.req.headers['user-agent'] || '',
        contentLength: this.req.headers['content-length'] || 0,
        timestamp: new Date().toISOString()
    };
    LSE_logger.info(`[Fennel-NG Request] ${logData.method} ${logData.url} - User: ${logData.username} - Auth: ${logData.authMethod}`);
    if(this.sessionId)
    {
        redis.setSessionData(this.sessionId + '_lastRequest', logData, 3600).catch(function(error)
        {
            LSE_logger.error(`[Fennel-NG Comm] Failed to log request data: ${error.message}`);
        });
    }
};
