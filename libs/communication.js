const config = require('../config').config;
const crypto = require('crypto');
const uuid = require('uuid');
const requesthandler = require('./requesthandler');
const redis = require('./redis');
const ldap = require('./ldap-integration');
const argon2auth = require('./argon2-auth');
const xmljs = require('fast-xml-parser');
const url = require('url');
const parser = new xmljs.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true
});
const builder = new xmljs.XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    indentBy: "  "
});
function comm(req, res, body, authresult) {
    this.req = req;
    this.res = res;
    this.reqbody = body;
    this.resbody = "";
    this.authresult = authresult || { authenticated: false };
    this.id = req.id || uuid.v4();
    this.sessionid = null;
    this.routeprefix = "";
    this.user = null;
    this.authority = null;
    this.getreq = function() {
        return this.req;
    };
    this.getauthresult = function() {
        return this.authresult;
    };
    this.getreqbody = function() {
        return this.reqbody;
    };
    this.getres = function() {
        return this.res;
    };
    this.getresbody = function() {
        return this.resbody;
    };
    this.getid = function() {
        return this.id;
    };
    this.getusername = function() {
        return this.getauthresult().ldap_username || this.getauthresult().username;
    };
    this.getcaldav_username = function() {
        return this.getauthresult().username;
    };
    this.geturl = function() {
        return this.req.url;
    };
    this.processrequest = async function() {
        try {
            LSE_Logger.info(`[FENNEL-NG RAW] ========== INCOMING REQUEST ${new Date().toISOString()} [${this.id}] ==========`);
            LSE_Logger.info(`[FENNEL-NG RAW] Method: ${this.req.method}`);
            LSE_Logger.info(`[FENNEL-NG RAW] URL: ${this.req.url}`);
            LSE_Logger.info(`[FENNEL-NG RAW] Query: ${JSON.stringify(this.req.query || {})}`);
            this.logheaders();
            this.logbody();
            if (!this.authresult.success) {
                LSE_Logger.warn(`[FENNEL-NG] Authentication failed: No authentication provided`);
                this.res.writeHead(401, {
                    'WWW-Authenticate': 'Basic realm="Fennel-NG"'
                });
                this.res.end('Authentication required');
                return false;
            }
            const result = await requesthandler.processrequest(this.req, this.res, {
                username: this.authresult.username,
                sessionid: this.authresult.sessionid
            });
            return result;
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG Comm] Error processing request: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.sendresponse = function(status, body, headers = {}) {
        for (const [key, value] of Object.entries(headers)) {
            this.res.setHeader(key, value);
        }
        this.res.writeHead(status);
        this.res.end(body);
        return true;
    };
    this.logheaders = function() {
        LSE_Logger.info(`[FENNEL-NG RAW] Headers [${this.id}] [TOTAL LENGTH: ${JSON.stringify(this.req.headers || {}).length}, LINES: ${Object.keys(this.req.headers || {}).length + 2}]:`);
        LSE_Logger.info(`[FENNEL-NG RAW] Headers [${this.id}] [1/${Object.keys(this.req.headers || {}).length + 2}]: {`);
        let linecounter = 2;
        for (const [key, value] of Object.entries(this.req.headers || {})) {
            LSE_Logger.info(`[FENNEL-NG RAW] Headers [${this.id}] [${linecounter++}/${Object.keys(this.req.headers || {}).length + 2}]:   "${key}": "${value}",`);
        }
        LSE_Logger.info(`[FENNEL-NG RAW] Headers [${this.id}] [${linecounter}/${Object.keys(this.req.headers || {}).length + 2}]: }`);
        LSE_Logger.info(`[FENNEL-NG RAW] Remote IP: ${this.req.connection?.remoteaddress}`);
        LSE_Logger.info(`[FENNEL-NG RAW] HTTP Version: ${this.req.httpversion}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Protocol: ${this.req.protocol}`);
    };
    this.logbody = function() {
        if (this.reqbody) {
            const bodystr = typeof this.reqbody === 'string' ? this.reqbody : JSON.stringify(this.reqbody);
            const lines = bodystr.split('\n');
            LSE_Logger.info(`[FENNEL-NG RAW] DATA CONTENT [${this.id}] [TOTAL LENGTH: ${bodystr.length}, LINES: ${lines.length}]:`);
            for (let i = 0; i < lines.length; i++) {
                LSE_Logger.info(`[FENNEL-NG RAW] DATA CONTENT [${this.id}] [${i+1}/${lines.length}]: ${lines[i]}`);
            }
            LSE_Logger.info(`[FENNEL-NG RAW] END EVENT: Total body length: ${bodystr.length}`);
            LSE_Logger.info(`[FENNEL-NG RAW] [${this.id}] [TOTAL LENGTH: ${bodystr.length}, LINES: ${lines.length}]:`);
            for (let i = 0; i < lines.length; i++) {
                LSE_Logger.info(`[FENNEL-NG RAW] [${this.id}] [${i+1}/${lines.length}]: ${lines[i]}`);
            }
        }
    };
    this.setstandardheaders = function() {
        this.res.setHeader("Server", "Fennel-NG/2.0");
        this.res.setHeader("Connection", "close");
    };
    this.setdavheaders = function() {
        this.res.setHeader("DAV", "1, 2, 3, addressbook, calendar-access, calendar-schedule, calendar-proxy, calendar-auto-schedule, extended-mkcol");
        this.res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCALENDAR, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT");
    };
    this.setresponsecode = function(code) {
        this.res.statuscode = code;
    };
    this.appendresbody = function(body) {
        this.resbody += body;
    };
    this.flushresponse = function() {
        this.res.write(this.resbody);
        this.res.end();
    };
    this.parsexml = function(xmlstring) {
        try {
            return parser.parse(xmlstring);
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG] XML parsing error: ${error.message}`);
            return null;
        }
    };
    this.serializexml = function(xmlobj) {
        try {
            return builder.build(xmlobj);
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG] XML serialization error: ${error.message}`);
            return null;
        }
    };
    this.createxmldocument = function() {
        try {
            return {
                '?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
                'root': {}
            };
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG] XML creation error: ${error.message}`);
            return null;
        }
    };
    this.getfullurl = function(path) {
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
    this.getprincipalurl = function(username) {
        if(!username) {
            username = this.getuser().getusername();
        }
        return this.getfullurl(`/p/${username}/`);
    };
    this.getcalendarurl = function(username, calendaruri) {
        if(!username) {
            username = this.getuser().getusername();
        }
        if(calendaruri) {
            return this.getfullurl(`/cal/${username}/${calendaruri}/`);
        } else {
            return this.getfullurl(`/cal/${username}/`);
        }
    };
    this.getcardurl = function(username, addressbookuri) {
        if(!username) {
            username = this.getuser().getusername();
        }
        if(addressbookuri) {
            return this.getfullurl(`/card/${username}/${addressbookuri}/`);
        } else {
            return this.getfullurl(`/card/${username}/`);
        }
    };
    this.geturlasarray = function() {
        var cleanurl = this.req.url;
        if(this.routeprefix && cleanurl.startsWith(this.routeprefix)) {
            cleanurl = cleanurl.substring(this.routeprefix.length);
        }
        var aurl = url.parse(cleanurl).pathname.split("/");
        if(aurl.length <= 0) {
            LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in comm.geturlasarray!`);
            return undefined;
        }
        return aurl;
    };
    this.getfilenamefrompath = function(removeending) {
        var aurl = this.geturlasarray();
        if(aurl.length <= 0) {
            LSE_Logger.warn(`[Fennel-NG Comm] Something evil happened in request.getfilenamefrompath`);
            return undefined;
        }
        var filename = aurl[aurl.length - 1];
        if(removeending) {
            var lastdotindex = filename.lastIndexOf('.');
            if(lastdotindex !== -1) {
                filename = filename.substring(0, lastdotindex);
            }
        }
        return filename;
    };
    this.getcalidfromurl = function() {
        var aurl = this.geturlasarray();
        if(aurl.length > 3) {
            return aurl[3];
        }
        return undefined;
    };
    this.geturlelementsize = function() {
        var aurl = this.geturlasarray();
        return aurl.length;
    };
    this.getheader = function(headername) {
        return this.req.headers[headername.toLowerCase()];
    };
    this.getpathelement = function(index) {
        var aurl = this.geturlasarray();
        if(aurl && aurl.length > index) {
            return aurl[index];
        }
        return undefined;
    };
    this.stringendswith = function(str, suffix) {
        return str && str.length >= suffix.length && str.substring(str.length - suffix.length) === suffix;
    };
    this.getuser = function() {
        return this.user;
    };
    this.handlecaldavrequest = async function() {
        try {
            const method = this.req.method.toUpperCase();
            switch (method) {
                case 'PROPFIND':
                    return await this.handlepropfind();
                case 'REPORT':
                    return await this.handlereport();
                case 'PUT':
                    return await this.handleput();
                case 'DELETE':
                    return await this.handledelete();
                case 'GET':
                    return await this.handleget();
                default:
                    LSE_Logger.warn(`[FENNEL-NG CalDAV] Unsupported method: ${method}`);
                    this.res.writeHead(405);
                    this.res.end('Method Not Allowed');
                    return false;
            }
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG CalDAV] Error handling request: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handlepropfind = async function() {
        try {
            const depth = this.req.headers.depth || '0';
            const xmlobj = this.parsexml(this.reqbody);
            if (!xmlobj) {
                this.res.writeHead(400);
                this.res.end('Invalid XML request');
                return false;
            }
            if (!xmlobj.propfind || !xmlobj.propfind.prop) {
                LSE_Logger.warn('[FENNEL-NG CalDAV] No prop element found in PROPFIND request');
                this.res.writeHead(400);
                this.res.end('Bad Request: Missing prop element');
                return false;
            }
            const propelement = xmlobj.propfind.prop;
            const requestedprops = [];
            for (const key in propelement) {
                if (key.startsWith('@_')) continue;
                let ns = '';
                let localname = key;
                if (key.includes(':')) {
                    const [prefix, name] = key.split(':');
                    if (prefix === 'D' || prefix === 'd') ns = 'DAV:';
                    else if (prefix === 'L' || prefix === 'l') ns = 'urn:ietf:params:xml:ns:caldav';
                    else if (prefix === 'I' || prefix === 'i') ns = 'http://inf-it.com/ns/dav/';
                    else if (prefix === 'R' || prefix === 'r') ns = 'urn:ietf:params:xml:ns:carddav';
                    localname = name;
                }
                const prefix = ns === 'DAV:' ? 'd' :
                              ns === 'urn:ietf:params:xml:ns:caldav' ? 'l' :
                              ns === 'http://apple.com/ns/ical/' ? 'a' :
                              ns === 'http://inf-it.com/ns/dav/' ? 'i' :
                              ns === 'http://inf-it.com/ns/ab/' ? 'i' :
                              ns === 'urn:ietf:params:xml:ns:carddav' ? 'r' :
                              'unknown';
                requestedprops.push(`${prefix}:${localname}`);
            }
            const responseobj = {
                'multistatus': {
                    '@_xmlns:d': 'DAV:',
                    '@_xmlns:cal': 'urn:ietf:params:xml:ns:caldav',
                    '@_xmlns:cs': 'http://calendarserver.org/ns/',
                    '@_xmlns:card': 'urn:ietf:params:xml:ns:carddav'
                }
            };
            const username = this.authresult.username;
            const resourcepath = this.req.url;
            const result = await requesthandler.handlecommoncaldavproperties(
                this.req,
                this.res,
                requestedprops,
                username,
                resourcepath,
                responseobj
            );
            if (result && result.element) {
                if (!responseobj.multistatus.response) {
                    responseobj.multistatus.response = [];
                }
                responseobj.multistatus.response.push(result.element);
                for (const prop of requestedprops) {
                    if (!result.handledprops.includes(prop)) {
                        LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PF: not handled: ${prop}`);
                    }
                }
                const xmlstring = this.serializexml(responseobj);
                this.res.writeHead(207, {'Content-Type': 'application/xml; charset="utf-8"'});
                this.res.end(xmlstring);
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE WRITE: ${xmlstring.length} bytes`);
                LSE_Logger.info(`[FENNEL-NG RAW] [${this.id}] [TOTAL LENGTH: ${xmlstring.length}, LINES: ${xmlstring.split('\n').length}]:`);
                LSE_Logger.info(`[FENNEL-NG RAW] ========== OUTGOING RESPONSE ${new Date().toISOString()} [${this.id}] ==========`);
                LSE_Logger.info(`[FENNEL-NG RAW] Status Code: 207`);
                LSE_Logger.info(`[FENNEL-NG RAW] Status Message: Multi-Status`);
                return true;
            } else {
                LSE_Logger.warn(`[Fennel-NG CalDAV] Failed to process properties`);
                this.res.writeHead(500);
                this.res.end('Failed to process properties');
                return false;
            }
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] PROPFIND error: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handlereport = async function() {
        try {
            LSE_Logger.info(`[Fennel-NG CalDAV] Processing REPORT request`);
            this.res.writeHead(200);
            this.res.end('REPORT request handled');
            return true;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] REPORT error: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handleput = async function() {
        try {
            LSE_Logger.info(`[Fennel-NG CalDAV] Processing PUT request`);
            this.res.writeHead(201);
            this.res.end('Resource created/updated');
            return true;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] PUT error: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handledelete = async function() {
        try {
            LSE_Logger.info(`[Fennel-NG CalDAV] Processing DELETE request`);
            this.res.writeHead(204);
            this.res.end();
            return true;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] DELETE error: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handleget = async function() {
        try {
            LSE_Logger.info(`[Fennel-NG CalDAV] Processing GET request`);
            this.res.writeHead(200, {'Content-Type': 'text/plain'});
            this.res.end('Resource content');
            return true;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] GET error: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.handlecarddavrequest = async function() {
        try {
            const method = this.req.method.toUpperCase();
            switch (method) {
                case 'PROPFIND':
                    return await this.handlepropfind();
                case 'REPORT':
                    return await this.handlereport();
                case 'PUT':
                    return await this.handleput();
                case 'DELETE':
                    return await this.handledelete();
                case 'GET':
                    return await this.handleget();
                default:
                    LSE_Logger.warn(`[FENNEL-NG CardDAV] Unsupported method: ${method}`);
                    this.res.writeHead(405);
                    this.res.end('Method Not Allowed');
                    return false;
            }
        } catch (error) {
            LSE_Logger.error(`[FENNEL-NG CardDAV] Error handling request: ${error.message}`, error.stack);
            this.res.writeHead(500);
            this.res.end('Internal Server Error');
            return false;
        }
    };
    this.checkpermission = function(strurl, strmethod) {
        return true;
    };
    LSE_Logger.debug(`[FENNEL-NG Comm] Communication object initialized for request [${this.id}]`);
}
module.exports = comm;

