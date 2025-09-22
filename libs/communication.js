var config = require('../config').config;
var redis = require('./redis');
var userLib = require('./user');
var url = require('url');
var pd = require('pretty-data').pd;
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
    this.authority = this.createSimpleAuthority();
    return this;
}
comm.prototype.createSimpleAuthority = function()
{
    var self = this;
    return {
        check: function(permission) {
            if (!self.authResult || !self.authResult.success) {
                return false;
            }
            var username = self.user.getUserName();
            var parts = permission.split(':');
            if (parts.length < 2) return false;
            var resource = parts[0];
            var user = parts[1];
            var action = parts[2] || '';
            if (resource === 'p' && (action === 'options' || action === 'report' || action === 'propfind')) {
                return true;
            }
            if ((resource === 'cal' || resource === 'card' || resource === 'p') && user === username) {
                return true;
            }
            return false;
        }
    };
};
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
        userAgent: this.req.headers['user-agent'] || 'Unknown',
        remoteAddress: this.req.connection.remoteAddress || this.req.socket.remoteAddress
    };
    if(this.sessionId)
    {
        redis.setSession(this.sessionId, sessionData).catch(function(err) {
            LSE_Logger.error(`[Fennel-NG Redis] Failed to store session: ${err.message}`);
        });
    }
};
comm.prototype.setStandardHeaders = function()
{
    this.res.setHeader("Server", "Fennel-NG/2.0");
    this.res.setHeader("Connection", "close");
};
comm.prototype.setDAVHeaders = function()
{
    this.res.setHeader("DAV", "1, 2, 3, addressbook, calendar-access, calendar-schedule, calendar-proxy, calendar-auto-schedule, extended-mkcol");
    this.res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCALENDAR, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT");
};
comm.prototype.setResponseCode = function(code)
{
    this.res.statusCode = code;
};
comm.prototype.appendResBody = function(body)
{
    this.resBody += body;
};
comm.prototype.flushResponse = function()
{
    this.res.write(this.resBody);
    this.res.end();
};
comm.prototype.pushOptionsResponse = function()
{
    this.setStandardHeaders();
    this.setDAVHeaders();
    this.setResponseCode(200);
    this.flushResponse();
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
    LSE_Logger.debug(`[Fennel-NG Comm] Checking authority for user '${this.getUser().getUserName()}' for '${s}' with result: ${ret}`);
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
        LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in comm.getUrlAsArray!`);
        return undefined;
    }
    return aUrl;
};
comm.prototype.getFilenameFromPath = function(removeEnding)
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in request.getFilenameFromPath`);
        return undefined;
    }
    var filename = aUrl[aUrl.length - 1];
    if(removeEnding)
    {
        var lastDotIndex = filename.lastIndexOf('.');
        if(lastDotIndex !== -1)
        {
            filename = filename.substring(0, lastDotIndex);
        }
    }
    return filename;
};
comm.prototype.getCalIdFromURL = function()
{
    var aUrl = this.getURLAsArray();
    if(aUrl.length > 3)
    {
        return aUrl[3];
    }
    return undefined;
};
comm.prototype.getUrlElementSize = function()
{
    var aUrl = this.getURLAsArray();
    return aUrl.length;
};
comm.prototype.getHeader = function(headerName)
{
    return this.req.headers[headerName.toLowerCase()];
};
