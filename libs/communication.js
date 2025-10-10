const config = require('../config').config;
const redis = require('./redis');
const userlib = require('./user');
const url = require('url');
const pd = require('pretty-data').pd;
function comm(req, res, reqbody, authresult) {
    this.req = req;
    this.reqbody = reqbody;
    this.res = res;
    this.resbody = "";
    this.authresult = authresult || null;
    this.sessionid = null;
    this.routeprefix = config.public_route_prefix || '';
    if(authresult && authresult.success) {
        this.user = new userlib.user(authresult.username);
        this.sessionid = this.generatesessionid();
        this.initializesession();
    } else {
        const header = req.headers['authorization'] || '';
        const token = header.split(/\s+/).pop() || '';
        const auth = Buffer.from(token, 'base64').toString();
        const parts = auth.split(/:/);
        const username = parts[0] || 'anonymous';
        this.user = new userlib.user(username);
    }
    this.authority = this.createsimpleauthority();
    return this;
}
comm.prototype.createsimpleauthority = function() {
    const self = this;
    return {
        check: function(permission) {
            if (!self.authresult || !self.authresult.success) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn('[Fennel-NG Comm] Authority check failed - no valid authentication');
                }
                return false;
            }
            const username = self.user.getUserName();
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug('[Fennel-NG Comm] Authority check for user: ' + username + ', permission: ' + permission);
            }
            const parts = permission.split(':');
            if (parts.length < 2) {
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug('[Fennel-NG Comm] Authority granted - insufficient permission parts');
                }
                return true;
            }
            const resource = parts[0];
            const user = parts[1];
            const action = parts[2] || '';
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug('[Fennel-NG Comm] Authority check - resource: ' + resource + ', user: ' + user + ', action: ' + action);
            }
            if (resource === 'cal' || resource === 'card' || resource === 'p') {
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug('[Fennel-NG Comm] Authority granted - CalDAV/CardDAV/Principal resource access');
                }
                return true;
            }
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug('[Fennel-NG Comm] Authority granted - default allow');
            }
            return true;
        }
    };
};
comm.prototype.generatesessionid = function() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
};
comm.prototype.initializesession = function() {
    if(!this.authresult || !this.authresult.success) {
        return;
    }
    const sessiondata = {
        username: this.authresult.username,
        authmethod: this.authresult.method,
        createdat: Math.floor(Date.now() / 1000),
        lastactivity: Math.floor(Date.now() / 1000),
        useragent: this.req.headers['user-agent'] || 'Unknown',
        remoteaddress: this.req.connection.remoteAddress || this.req.socket.remoteAddress
    };
    if(this.sessionid) {
        redis.setsessiondata(this.sessionid, sessiondata).catch(function(err) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error('[Fennel-NG Redis] Failed to store session: ' + err.message);
            }
        });
    }
};
comm.prototype.setstandardheaders = function() {
    this.res.setHeader("Server", "Fennel-NG/2.0");
    this.res.setHeader("Connection", "close");
};
comm.prototype.setdavheaders = function() {
    this.res.setHeader("DAV", "1, 2, 3, addressbook, calendar-access, calendar-schedule, calendar-proxy, calendar-auto-schedule, extended-mkcol");
    this.res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCALENDAR, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT");
};
comm.prototype.setresponsecode = function(code) {
    this.res.statusCode = code;
};
comm.prototype.appendresbody = function(body) {
    this.resbody += body;
};
comm.prototype.setresbody = function(body) {
    this.resbody = body;
};
comm.prototype.flushresponse = function() {
    this.res.write(this.resbody);
    this.res.end();
};
comm.prototype.pushoptionsresponse = function() {
    this.setstandardheaders();
    this.setdavheaders();
    this.setresponsecode(200);
    this.flushresponse();
};
comm.prototype.setheader = function(key, value) {
    this.res.setHeader(key, value);
};
comm.prototype.getuser = function() {
    return this.user;
};
comm.prototype.getusername = function() {
    return this.getauthresult().ldap_username || this.getauthresult().username;
};
comm.prototype.getcaldav_username = function() {
    return this.getauthresult().username;
};
comm.prototype.getauthresult = function() {
    return this.authresult;
};
comm.prototype.getsessionid = function() {
    return this.sessionid;
};
comm.prototype.getauthority = function() {
    return this.authority;
};
comm.prototype.checkpermission = function(strurl, strmethod) {
    let cleanurl = strurl;
    if(this.routeprefix && cleanurl.startsWith(this.routeprefix)) {
        cleanurl = cleanurl.substring(this.routeprefix.length);
    }
    const urlparts = cleanurl.substr(1).split("/").filter(String);
    const permissionstring = urlparts.join(":") + ":" + strmethod.toLowerCase();
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG Comm] URL: \'' + strurl + '\' -> clean: \'' + cleanurl + '\' -> parts: ' + JSON.stringify(urlparts) + ' -> permission: \'' + permissionstring + '\'');
    }
    const ret = this.authority.check(permissionstring);
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG Comm] Permission result for user \'' + this.getUser().getUserName() + '\': ' + ret);
    }
    return ret;
};
comm.prototype.getreq = function() {
    return this.req;
};
comm.prototype.getres = function() {
    return this.res;
};
comm.prototype.getreqbody = function() {
    return this.reqbody;
};
comm.prototype.getresbody = function() {
    return this.resbody;
};
comm.prototype.geturl = function() {
    return this.req.url;
};
comm.prototype.getfullurl = function(path) {
    if(!path) {
        path = this.req.url;
    }
    if(this.routeprefix && !path.startsWith(this.routeprefix)) {
        if(path.startsWith('/')) {
            return this.routeprefix + path;
        } else {
            return this.routeprefix + '/' + path;
        }
    }
    return path;
};
comm.prototype.getprincipalurl = function(username) {
    if(!username) {
        username = this.getuser().getUserName();
    }
    return this.getfullurl('/p/' + username + '/');
};
comm.prototype.getcalendarurl = function(username, calendaruri) {
    if(!username) {
        username = this.getuser().getUserName();
    }
    if(calendaruri) {
        return this.getfullurl('/cal/' + username + '/' + calendaruri + '/');
    } else {
        return this.getfullurl('/cal/' + username + '/');
    }
};
comm.prototype.getcardurl = function(username, addressbookuri) {
    if(!username) {
        username = this.getuser().getUserName();
    }
    if(addressbookuri) {
        return this.getfullurl('/card/' + username + '/' + addressbookuri + '/');
    } else {
        return this.getfullurl('/card/' + username + '/');
    }
};
comm.prototype.geturlasarray = function() {
    let cleanurl = this.req.url;
    if(this.routeprefix && cleanurl.startsWith(this.routeprefix)) {
        cleanurl = cleanurl.substring(this.routeprefix.length);
    }
    const aurl = url.parse(cleanurl).pathname.split("/");
    if(aurl.length <= 0) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.warn('[Fennel-NG Comm] Something evil happened in comm.getUrlAsArray!');
        }
        return undefined;
    }
    return aurl;
};
comm.prototype.getFilenameFromPath = function(removeending) {
    const aurl = this.getURLAsArray();
    if(aurl.length <= 0) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.warn('[Fennel-NG Comm] Something evil happened in request.getFilenameFromPath');
        }
        return undefined;
    }
    let filename = aurl[aurl.length - 1];
    if(removeending) {
        const lastdotindex = filename.lastIndexOf('.');
        if(lastdotindex !== -1) {
            filename = filename.substring(0, lastdotindex);
        }
    }
    return filename;
};
comm.prototype.getCalIdFromURL = function() {
    const aurl = this.getURLAsArray();
    if(aurl.length > 3) {
        return aurl[3];
    }
    return undefined;
};
comm.prototype.getUrlElementSize = function() {
    const aurl = this.getURLAsArray();
    return aurl.length;
};
comm.prototype.getHeader = function(headername) {
    return this.req.headers[headername.toLowerCase()];
};
comm.prototype.getPathElement = function(index) {
    const aurl = this.getURLAsArray();
    if(aurl && aurl.length > index) {
        return aurl[index];
    }
    return undefined;
};
comm.prototype.stringEndsWith = function(str, suffix) {
    return str && str.length >= suffix.length && str.substring(str.length - suffix.length) === suffix;
};
module.exports = comm;
