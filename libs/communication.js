var config = require('../config').config;
var redis = require('./redis');
var userLib = require('./user');
var url = require('url');
var pd = require('pretty-data').pd;
var { hash } = require('blake3-wasm');
module.exports = comm;
function comm(req, res, reqBody, authResult)
{
    this.req = req;
    this.reqBody = reqBody;
    this.res = res;
    this.resBody = "";
    this.authResult = authResult || null;
    this.sessionId = null;
    this.routePrefix = config.public_route_prefix || '';
    if(authResult && authResult.success)
    {
        this.user = new userLib.user(authResult.username);
        this.sessionId = this.generateSessionId(authResult);
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
                LSE_Logger.warn(`[Fennel-NG Comm] Authority check failed - no valid authentication`);
                return false;
            }
            var username = self.user.getUserName();
            LSE_Logger.debug(`[Fennel-NG Comm] Authority check for user: ${username}, permission: ${permission}`);
            var parts = permission.split(':');
            if (parts.length < 2) {
                LSE_Logger.debug(`[Fennel-NG Comm] Authority granted - insufficient permission parts`);
                return true;
            }
            var resource = parts[0];
            var user = parts[1];
            var action = parts[2] || '';
            LSE_Logger.debug(`[Fennel-NG Comm] Authority check - resource: ${resource}, user: ${user}, action: ${action}`);
            if (resource === 'cal' || resource === 'card' || resource === 'p') {
                LSE_Logger.debug(`[Fennel-NG Comm] Authority granted - CalDAV/CardDAV/Principal resource access`);
                return true;
            }
            LSE_Logger.debug(`[Fennel-NG Comm] Authority granted - default allow`);
            return true;
        }
    };
};
comm.prototype.generateSessionId = function(authResult)
{
    var authentication = require('./authentication');
    var jwtToken = null;
    if(authResult && authResult.method === 'jwt' && authResult.payload)
    {
        var token = this.req.headers.authorization;
        if(token && token.startsWith('Bearer '))
        {
            jwtToken = token.substring(7);
        }
        else if(this.req.headers.cookie)
        {
            var cookies = this.req.headers.cookie.split(';');
            for(var i = 0; i < cookies.length; i++)
            {
                var cookie = cookies[i].trim();
                if(cookie.startsWith(config.jwt_cookie_name + '='))
                {
                    jwtToken = cookie.substring(config.jwt_cookie_name.length + 1);
                    break;
                }
            }
        }
    }
    if(jwtToken && authResult && authResult.ldap_username)
    {
        var username = authResult.ldap_username.toLowerCase().trim();
        var sessionid = hash(username + jwtToken).toString('hex');
        LSE_Logger.debug(`[Fennel-NG Comm] Generated deterministic session ID using BLAKE3 for user: ${username}`);
        return sessionid;
    }
    else
    {
        var crypto = require('crypto');
        var fallbackid = crypto.randomBytes(32).toString('hex');
        LSE_Logger.warn(`[Fennel-NG Comm] JWT token not available, using random session ID`);
        return fallbackid;
    }
};
comm.prototype.initializeSession = function()
{
    if(!this.authResult || !this.authResult.success)
    {
        return;
    }
    var sessiondata = {
        username: this.authResult.username,
        authmethod: this.authResult.method,
        createdat: Math.floor(Date.now() / 1000),
        lastactivity: Math.floor(Date.now() / 1000),
        useragent: this.req.headers['user-agent'] || 'Unknown',
        remoteaddress: this.req.connection.remoteAddress || this.req.socket.remoteAddress
    };
    if(this.sessionId)
    {
        LSE_Logger.debug(`[Fennel-NG Comm] Storing session data for session ID: ${this.sessionId}`);
        redis.setSessionData(this.sessionId, sessiondata).catch(function(err) {
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
comm.prototype.getusername = function()
{
    return this.getAuthResult().ldap_username || this.getAuthResult().username;
};
comm.prototype.getcaldav_username = function()
{
    return this.getAuthResult().username;
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
    var cleanurl = strURL;
    if(this.routePrefix && cleanurl.startsWith(this.routePrefix))
    {
        cleanurl = cleanurl.substring(this.routePrefix.length);
    }
    var urlparts = cleanurl.substr(1).split("/").filter(String);
    var permissionstring = urlparts.join(":") + ":" + strMethod.toLowerCase();
    LSE_Logger.debug(`[Fennel-NG Comm] URL: '${strURL}' -> clean: '${cleanurl}' -> parts: ${JSON.stringify(urlparts)} -> permission: '${permissionstring}'`);
    var ret = this.authority.check(permissionstring);
    LSE_Logger.debug(`[Fennel-NG Comm] Permission result for user '${this.getUser().getUserName()}': ${ret}`);
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
comm.prototype.getFullURL = function(path)
{
    if(!path) {
        path = this.req.url;
    }
    if(this.routePrefix && !path.startsWith(this.routePrefix)) {
        if(path.startsWith('/')) {
            return this.routePrefix + path;
        } else {
            return this.routePrefix + '/' + path;
        }
    }
    return path;
};
comm.prototype.getPrincipalURL = function(username)
{
    if(!username) {
        username = this.getUser().getUserName();
    }
    return this.getFullURL(`/p/${username}/`);
};
comm.prototype.getCalendarURL = function(username, calendaruri)
{
    if(!username) {
        username = this.getUser().getUserName();
    }
    if(calendaruri) {
        return this.getFullURL(`/cal/${username}/${calendaruri}/`);
    } else {
        return this.getFullURL(`/cal/${username}/`);
    }
};
comm.prototype.getCardURL = function(username, addressbookuri)
{
    if(!username) {
        username = this.getUser().getUserName();
    }
    if(addressbookuri) {
        return this.getFullURL(`/card/${username}/${addressbookuri}/`);
    } else {
        return this.getFullURL(`/card/${username}/`);
    }
};
comm.prototype.getURLAsArray = function()
{
    var cleanurl = this.req.url;
    if(this.routePrefix && cleanurl.startsWith(this.routePrefix))
    {
        cleanurl = cleanurl.substring(this.routePrefix.length);
    }
    var aurl = url.parse(cleanurl).pathname.split("/");
    if(aurl.length <= 0)
    {
        LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in comm.getUrlAsArray!`);
        return undefined;
    }
    return aurl;
};
comm.prototype.getFilenameFromPath = function(removeending)
{
    var aurl = this.getURLAsArray();
    if(aurl.length <= 0)
    {
        LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in request.getFilenameFromPath`);
        return undefined;
    }
    var filename = aurl[aurl.length - 1];
    if(removeending)
    {
        var lastdotindex = filename.lastIndexOf('.');
        if(lastdotindex !== -1)
        {
            filename = filename.substring(0, lastdotindex);
        }
    }
    return filename;
};
comm.prototype.getCalIdFromURL = function()
{
    var aurl = this.getURLAsArray();
    if(aurl.length > 3)
    {
        return aurl[3];
    }
    return undefined;
};
comm.prototype.getUrlElementSize = function()
{
    var aurl = this.getURLAsArray();
    return aurl.length;
};
comm.prototype.getHeader = function(headername)
{
    return this.req.headers[headername.toLowerCase()];
};
comm.prototype.getPathElement = function(index)
{
    var aurl = this.getURLAsArray();
    if(aurl && aurl.length > index)
    {
        return aurl[index];
    }
    return undefined;
};
comm.prototype.stringEndsWith = function(str, suffix)
{
    return str && str.length >= suffix.length && str.substring(str.length - suffix.length) === suffix;
};

