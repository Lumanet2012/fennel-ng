const config = require('./config').config;
const authlib = require('./libs/authentication');
const handler = require('./libs/requesthandler');
const communication = require('./libs/communication');
const redis = require('./libs/redis');
const db = require('./libs/db');
const httpauth = require('http-auth');
const crossroads = require('crossroads');
crossroads.ignoreState = true;
const basic = httpauth.basic(
    {
        realm: "Fennel-NG CalDAV/CardDAV"
    }, function (username, password, callback)
    {
        authlib.checkLogin(basic, username, password, callback);
    }
);
function initializefennelng()
{
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('[Fennel-NG] Initializing Fennel-NG CalDAV/CardDAV server');
    }
    return Promise.all([
        redis.initializeredis(),
        db.testdatabaseconnection()
    ]).then(function(results)
    {
        const redisinitialized = results[0];
        const dbconnected = results[1];
        if(!dbconnected)
        {
            throw new Error('Database connection failed');
        }
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG] Redis and Database initialized successfully');
        }
        return db.syncdatabase();
    }).then(function()
    {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG] Database schema synchronized');
        }
        setupRoutes();
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG] Routes configured successfully');
        }
        return {
            status: 'initialized',
            middleware: createexpressmiddleware(),
            handlerequest: handlerequest,
            healthcheck: healthcheck,
            routes: getroutes()
        };
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Initialization failed: ${error.message}`);
        throw error;
    });
}
function setuproutes() {
    const prefix = config.public_route_prefix || '';
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG] Registering route: ${prefix + '/cal/'}`);
    }
    crossroads.addroute(prefix + '/', onhitroot);
    crossroads.addroute(prefix + '/.well-known/{type}', onhitwellknown);
    crossroads.addroute(prefix + '/p/{params*}', onhitprincipal);
    crossroads.addroute(prefix + '/cal/', onhitcalendarroot);
    crossroads.addroute(prefix + '/cal', onhitcalendarroot);
    crossroads.addroute(prefix + '/cal/{caldav_username}', onhitcalendar);
    crossroads.addroute(prefix + '/cal/{caldav_username}/', onhitcalendar);
    crossroads.addroute(prefix + '/cal/{caldav_username}/{params*}', onhitcalendar);
    crossroads.addroute(prefix + '/card/', onhitaddressbookroot);
    crossroads.addroute(prefix + '/card', onhitaddressbookroot);
    crossroads.addroute(prefix + '/card/{caldav_username}/{params*}', onhitaddressbook);
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG] onBypass: ${onbypass}`);
    }
    crossroads.bypassed.add(onbypass);
}
function onbypass(comm, path)
{
    try {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info(`[Fennel-NG DEBUG] ========== BYPASS ROUTE ==========`);
            LSE_Logger.info(`[Fennel-NG DEBUG] Unknown URL: ${path}`);
            LSE_Logger.info(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.info(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.info(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.info(`[Fennel-NG DEBUG] =====================================`);
        }
        const res = comm.getres();
        res.writeHead(404);
        res.write(`${path} is not a valid CalDAV/CardDAV endpoint`);
        res.end();
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onbypass: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitroot(comm)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== ROOT HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Redirecting to /p/`);
            LSE_Logger.debug('[Fennel-NG DEBUG] =============================');
        }
        comm.getres().writeHead(302, { 'Location': comm.getfullurl('/p/') });
        comm.flushresponse();
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onhitroot: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitwellknown(comm, type)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== WELL-KNOWN HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] Type: ${type}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
        }
        const location = type === 'caldav' ? '/cal/' : (type === 'carddav' ? '/card/' : '/p/');
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Redirecting to: ${location}`);
            LSE_Logger.debug('[Fennel-NG DEBUG] ===================================');
        }
        comm.getres().writeHead(302, { 'Location': comm.getfullurl(location) });
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onhitwellknown: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitprincipal(comm, params)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== PRINCIPAL HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
            LSE_Logger.debug('[Fennel-NG DEBUG] ==================================');
        }
        comm.params = params;
        if(!comm.checkpermission('/p/' + (params || ''), comm.getreq().method))
        {
            const res = comm.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG] Request denied for user: ${comm.getuser().getusername()}`);
            }
            res.writeHead(403);
            res.write("Access denied to this resource");
            res.end();
            return;
        }
        handler.handleprincipal(comm);
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onHitPrincipal: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitcalendar(comm, caldav_username, params)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== CALENDAR HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] CalDAV Username: ${caldav_username}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            if(comm.getuser()) {
                LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
            }
            LSE_Logger.debug('[Fennel-NG DEBUG] =================================');
        }
        const username = caldav_username.replace(/-/g, '@');
        comm.username = username;
        comm.caldav_username = caldav_username;
        comm.params = params;
        const calendarpath = comm.getfullurl("/cal/") + caldav_username + "/" + (params || '');
        if(!comm.checkpermission(calendarpath, comm.getreq().method))
        {
            const res = comm.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG] Calendar request denied for user: ${comm.getuser().getUserName()}`);
            }
            res.writeHead(403);
            res.write("Access denied to this calendar resource");
            res.end();
            return;
        }
        handler.handleCalendar(comm);
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onHitCalendar: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitaddressbook(comm, caldav_username, params)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== ADDRESSBOOK HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] CalDAV Username: ${caldav_username}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
            LSE_Logger.debug('[Fennel-NG DEBUG] =====================================');
        }
        const username = caldav_username.replace(/-/g, '@');
        comm.username = username;
        comm.caldav_username = caldav_username;
        comm.params = params;
        const addressbookpath = comm.getfullurl("/card/") + caldav_username + "/" + (params || '');
        if(!comm.checkpermission(addressbookpath, comm.getreq().method))
        {
            const res = comm.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG] CardDAV request denied for user: ${comm.getuser().getUserName()}`);
            }
            res.writeHead(403);
            res.write("Access denied to this addressbook resource");
            res.end();
            return;
        }
        handler.handleaddressbook(comm);
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onhitaddressbook: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitcalendarroot(comm)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== CALENDAR ROOT HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getusername()}`);
            LSE_Logger.debug('[Fennel-NG DEBUG] ======================================');
        }
        if(!comm.checkpermission('/cal/', comm.getreq().method))
        {
            const res = comm.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG] Calendar root request denied for user: ${comm.getuser().getusername()}`);
            }
            res.writeHead(403);
            res.write("Access denied to calendar root");
            res.end();
            return;
        }
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Calling handler.handlecalendarroot`);
        }
        handler.handleCalendarRoot(comm);
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] handler.handlecalendarroot completed`);
        }
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onhitcalendarroot: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function onhitaddressbookroot(comm)
{
    try {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug('[Fennel-NG DEBUG] ========== ADDRESSBOOK ROOT HIT ==========');
            LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getreq().method}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getreq().url}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getreq().headers)}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getreqbody()}`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getuser().getUserName()}`);
            LSE_Logger.debug('[Fennel-NG DEBUG] =========================================');
        }
        if(!comm.checkpermission('/card/', comm.getreq().method))
        {
            const res = comm.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG] Addressbook root request denied for user: ${comm.getuser().getUserName()}`);
            }
            res.writeHead(403);
            res.write("Access denied to addressbook root");
            res.end();
            return;
        }
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Calling handler.handleAddressbookRoot`);
        }
        handler.handleaddressbookroot(comm);
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] handler.handleAddressbookRoot completed`);
        }
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG] Error in onHitAddressbookRoot: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Stack: ${error.stack}`);
        if(comm && comm.getres && !comm.getres().headersSent) {
            comm.getres().writeHead(500);
            comm.getres().end('Internal server error');
        }
    }
}
function handlerequest(req, res, next)
{
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG DEBUG] ========== INCOMING REQUEST ==========`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${req.method}`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] Original URL: ${req.originalUrl || req.url}`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(req.headers)}`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] Remote IP: ${req.connection.remoteAddress || req.socket.remoteAddress}`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] User Agent: ${req.headers['user-agent']}`);
        LSE_Logger.debug('[Fennel-NG DEBUG] =====================================');
    }
    const originalurl = req.originalurl || req.url;
    const prefix = config.public_route_prefix || '';
    let cleanurl = originalurl;
    if(prefix && originalurl.startsWith(prefix)) {
        cleanurl = originalurl.substring(prefix.length);
    }
    if(cleanurl === '') cleanurl = '/';
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG DEBUG] URL Processing: original='${originalurl}' prefix='${prefix}' clean='${cleanurl}'`);
    }
    let reqbody = "";
    req.on('data', function (data)
    {
        reqbody += data.toString();
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Data chunk received: ${data.length} bytes`);
        }
    });
    req.on('end', function()
    {
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Request body complete: ${reqbody.length} bytes`);
            LSE_Logger.debug(`[Fennel-NG DEBUG] Full request body: ${reqbody}`);
        }
        authlib.authenticaterequest(req).then(function(authresult)
        {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG DEBUG] Authentication result: ${JSON.stringify(authresult)}`);
            }
            if(!authresult.success)
            {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG] Authentication failed: ${authresult.error}`);
                }
                if(!res.headersSent)
                {
                    if(config.auth_method.includes('jwt'))
                    {
                        res.writeHead(401, {
                            'WWW-Authenticate': 'Bearer realm="Fennel-NG", Basic realm="Fennel-NG"',
                            'Content-Type': 'application/json'
                        });
                        res.end(JSON.stringify({
                            error: 'Authentication required',
                            message: authresult.error
                        }));
                    }
                    else
                    {
                        res.writeHead(401, {
                            'WWW-Authenticate': 'Basic realm="Fennel-NG"'
                        });
                        res.end('Authentication required');
                    }
                }
                return;
            }
            try
            {
                const tempreq = {
                    url: cleanurl,
                    method: req.method,
                    headers: req.headers || {},
                    connection: req.connection,
                    socket: req.socket,
                    originalUrl: req.originalUrl
                };
                const comm = new communication(tempreq, res, reqbody, authresult);
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG DEBUG] Communication object created for user: ${authresult.username}`);
                    LSE_Logger.debug(`[Fennel-NG DEBUG] Parsing URL with crossroads: ${originalurl}`);
                }
                crossroads.parse(originalurl, [comm]);
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG DEBUG] Crossroads parsing completed`);
                }
            }
            catch(error)
            {
                LSE_Logger.error(`[Fennel-NG] Internal Request processing error: ${error.message}`);
                LSE_Logger.error(`[Fennel-NG DEBUG] Error stack: ${error.stack}`);
                if(!res.headersSent)
                {
                    res.writeHead(500);
                    res.end('Internal server error');
                }
            }
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG] Authentication error: ${error.message}`);
            LSE_Logger.error(`[Fennel-NG DEBUG] Auth error stack: ${error.stack}`);
            if(!res.headersSent)
            {
                res.writeHead(500);
                res.end('Authentication system error');
            }
        });
    });
    req.on('error', function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Request error: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Request error stack: ${error.stack}`);
        if(!res.headersSent)
        {
            res.writeHead(400);
            res.end('Bad request');
        }
    });
}
function getroutes()
{
    return [
        { path: '/p', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT'] },
        { path: '/cal', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT', 'MKCALENDAR', 'PUT', 'GET', 'DELETE', 'MOVE'] },
        { path: '/card', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT', 'PUT', 'GET', 'DELETE', 'MOVE'] },
        { path: '/.well-known', methods: ['GET'] },
        { path: '/', methods: ['GET'] }
    ];
}
function healthcheck()
{
    return Promise.all([
        redis.healthCheck(),
        db.healthCheck(),
        authlib.healthCheck()
    ]).then(function(results)
    {
        const redishealth = results[0];
        const dbhealth = results[1];
        const authhealth = results[2];
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: config.version_nr,
            components: {
                redis: redishealth,
                database: dbhealth,
                authentication: authhealth
            },
            routes: getRoutes().length,
            auth_method: config.auth_method
        };
    }).catch(function(error)
    {
        return {
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message,
            version: config.version_nr
        };
    });
}
function createexpressmiddleware() {
    return function(req, res, next) {
        const originalurl = req.originalurl || req.url;
        const prefix = config.public_route_prefix || '';
        const isfennelpath = prefix && originalurl.startsWith(prefix);
        if (isfennelpath) {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG] Handling CalDAV/CardDAV request: ${originalurl}`);
            }
            handlerequest(req, res, next);
        } else {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG] Skipping non-CalDAV/CardDAV request: ${originalurl}`);
            }
            next();
        }
    };
}
function shutdown()
{
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('[Fennel-NG] Shutting down CalDAV/CardDAV server');
    }
    return Promise.all([
        redis.initializeRedis().then(function(client) {
            if(client && client.disconnect) {
                return client.disconnect();
            }
        }),
        db.sequelize.close()
    ]).then(function()
    {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG] Shutdown completed successfully');
        }
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Shutdown error: ${error.message}`);
    });
}
module.exports = {
    initialize: initializefennelng,
    middleware: createexpressmiddleware,
    handlerequest: handlerequest,
    healthcheck: healthcheck,
    shutdown: shutdown,
    version: config.version_nr,
    routes: getroutes
};

