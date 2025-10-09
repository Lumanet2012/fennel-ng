const config = require('./config').config;
const authlib = require('./libs/authentication');
const handler = require('./libs/requesthandler');
const comm = require('./libs/communication');
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
function initializeFennelNG()
{
    LSE_Logger.info('[Fennel-NG] Initializing Fennel-NG CalDAV/CardDAV server');
    return Promise.all([
        redis.initializeRedis(),
        db.testDatabaseConnection()
    ]).then(function(results)
    {
        var redisInitialized = results[0];
        var dbConnected = results[1];
        if(!dbConnected)
        {
            throw new Error('Database connection failed');
        }
        LSE_Logger.info('[Fennel-NG] Redis and Database initialized successfully');
        return db.syncDatabase();
    }).then(function()
    {
        LSE_Logger.info('[Fennel-NG] Database schema synchronized');
        setupRoutes();
        LSE_Logger.info('[Fennel-NG] Routes configured successfully');
        return {
            status: 'initialized',
            middleware: createExpressMiddleware(),
            handleRequest: handleRequest,
            healthCheck: healthCheck,
            routes: getRoutes()
        };
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Initialization failed: ${error.message}`);
        throw error;
    });
}
function setupRoutes() {
    var prefix = config.public_route_prefix || '';
    LSE_Logger.debug(`[Fennel-NG] Registering route: ${prefix + '/cal/'}`);
    crossroads.addRoute(prefix + '/', onHitRoot);
    crossroads.addRoute(prefix + '/.well-known/{type}', onHitWellKnown);
    crossroads.addRoute(prefix + '/p/{params*}', onHitPrincipal);
    crossroads.addRoute(prefix + '/cal/', onHitCalendarRoot);
    crossroads.addRoute(prefix + '/cal', onHitCalendarRoot);
    crossroads.addRoute(prefix + '/cal/{caldav_username}', onHitCalendar);
    crossroads.addRoute(prefix + '/cal/{caldav_username}/', onHitCalendar);
    crossroads.addRoute(prefix + '/cal/{caldav_username}/{params*}', onHitCalendar);
    crossroads.addRoute(prefix + '/card/', onHitAddressbookRoot);
    crossroads.addRoute(prefix + '/card', onHitAddressbookRoot);
    crossroads.addRoute(prefix + '/card/{caldav_username}/{params*}', onHitAddressbook);
    LSE_Logger.debug(`[Fennel-NG] onBypass: ${onBypass}`);
    crossroads.bypassed.add(onBypass);
}
function onBypass(comm, path)
{
    LSE_Logger.info(`[Fennel-NG DEBUG] ========== BYPASS ROUTE ==========`);
    LSE_Logger.info(`[Fennel-NG DEBUG] Unknown URL: ${path}`);
    LSE_Logger.info(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.info(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.info(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.info(`[Fennel-NG DEBUG] =====================================`);
    var res = comm.getRes();
    res.writeHead(404);
    res.write(`${path} is not a valid CalDAV/CardDAV endpoint`);
    res.end();
}
function onHitRoot(comm)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== ROOT HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Redirecting to /p/`);
    LSE_Logger.debug('[Fennel-NG DEBUG] =============================');
    comm.getRes().writeHead(302, { 'Location': comm.getFullURL('/p/') });
    comm.flushResponse();
}
function onHitWellKnown(comm, type)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== WELL-KNOWN HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Type: ${type}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    let location = type === 'caldav' ? '/cal/' : (type === 'carddav' ? '/card/' : '/p/');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Redirecting to: ${location}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] ===================================');
    comm.getRes().writeHead(302, { 'Location': comm.getFullURL(location) });
}
function onHitPrincipal(comm, params)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== PRINCIPAL HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] ==================================');
    comm.params = params;
    if(!comm.checkPermission('/p/' + (params || ''), comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] Request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to this resource");
        res.end();
        return;
    }
    handler.handlePrincipal(comm);
}
function onHitCalendar(comm, caldav_username, params)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== CALENDAR HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] CalDAV Username: ${caldav_username}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] =================================');
    var username = caldav_username.replace(/-/g, '@');
    comm.username = username;
    comm.caldav_username = caldav_username;
    comm.params = params;
    var calendarPath = comm.getFullURL("/cal/") + caldav_username + "/" + (params || '');
    if(!comm.checkPermission(calendarPath, comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] Calendar request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to this calendar resource");
        res.end();
        return;
    }
    handler.handleCalendar(comm);
}
function onHitAddressbook(comm, caldav_username, params)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== ADDRESSBOOK HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] CalDAV Username: ${caldav_username}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Params: ${params}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] =====================================');
    var username = caldav_username.replace(/-/g, '@');
    comm.username = username;
    comm.caldav_username = caldav_username;
    comm.params = params;
    var addressbookPath = comm.getFullURL("/card/") + caldav_username + "/" + (params || '');
    if(!comm.checkPermission(addressbookPath, comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] CardDAV request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to this addressbook resource");
        res.end();
        return;
    }
    handler.handleAddressbook(comm);
}
function onHitCalendarRoot(comm)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== CALENDAR ROOT HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] ======================================');
    if(!comm.checkPermission('/cal/', comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] Calendar root request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to calendar root");
        res.end();
        return;
    }
    LSE_Logger.debug(`[Fennel-NG DEBUG] Calling handler.handleCalendarRoot`);
    handler.handleCalendarRoot(comm);
    LSE_Logger.debug(`[Fennel-NG DEBUG] handler.handleCalendarRoot completed`);
}
function onHitAddressbookRoot(comm)
{
    LSE_Logger.debug('[Fennel-NG DEBUG] ========== ADDRESSBOOK ROOT HIT ==========');
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${comm.getReq().method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL: ${comm.getReq().url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(comm.getReq().headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Body: ${comm.getReqBody()}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User: ${comm.getUser().getUserName()}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] =========================================');
    if(!comm.checkPermission('/card/', comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] Addressbook root request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to addressbook root");
        res.end();
        return;
    }
    LSE_Logger.debug(`[Fennel-NG DEBUG] Calling handler.handleAddressbookRoot`);
    handler.handleAddressbookRoot(comm);
    LSE_Logger.debug(`[Fennel-NG DEBUG] handler.handleAddressbookRoot completed`);
}
function handleRequest(req, res, next)
{
    LSE_Logger.debug(`[Fennel-NG DEBUG] ========== INCOMING REQUEST ==========`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Method: ${req.method}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Original URL: ${req.originalUrl || req.url}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Headers: ${JSON.stringify(req.headers)}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] Remote IP: ${req.connection.remoteAddress || req.socket.remoteAddress}`);
    LSE_Logger.debug(`[Fennel-NG DEBUG] User Agent: ${req.headers['user-agent']}`);
    LSE_Logger.debug('[Fennel-NG DEBUG] =====================================');
    var originalUrl = req.originalUrl || req.url;
    var prefix = config.public_route_prefix || '';
    var cleanUrl = originalUrl;
    if(prefix && originalUrl.startsWith(prefix)) {
        cleanUrl = originalUrl.substring(prefix.length);
    }
    if(cleanUrl === '') cleanUrl = '/';
    LSE_Logger.debug(`[Fennel-NG DEBUG] URL Processing: original='${originalUrl}' prefix='${prefix}' clean='${cleanUrl}'`);
    var reqBody = "";
    req.on('data', function (data)
    {
        reqBody += data.toString();
        LSE_Logger.debug(`[Fennel-NG DEBUG] Data chunk received: ${data.length} bytes`);
    });
    req.on('end', function()
    {
        LSE_Logger.debug(`[Fennel-NG DEBUG] Request body complete: ${reqBody.length} bytes`);
        LSE_Logger.debug(`[Fennel-NG DEBUG] Full request body: ${reqBody}`);
        authlib.authenticateRequest(req).then(function(authResult)
        {
            LSE_Logger.debug(`[Fennel-NG DEBUG] Authentication result: ${JSON.stringify(authResult)}`);
            if(!authResult.success)
            {
                LSE_Logger.warn(`[Fennel-NG] Authentication failed: ${authResult.error}`);
                if(config.auth_method.includes('jwt'))
                {
                    res.writeHead(401, {
                        'WWW-Authenticate': 'Bearer realm="Fennel-NG", Basic realm="Fennel-NG"',
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({
                        error: 'Authentication required',
                        message: authResult.error
                    }));
                }
                else
                {
                    res.writeHead(401, {
                        'WWW-Authenticate': 'Basic realm="Fennel-NG"'
                    });
                    res.end('Authentication required');
                }
                return;
            }
            try
            {
                var tempReq = {
                    url: cleanUrl,
                    method: req.method,
                    headers: req.headers || {},
                    connection: req.connection,
                    socket: req.socket,
                    originalUrl: req.originalUrl
                };
                const commobj = new comm(tempReq, res, reqBody, authResult);
                commobj.processRequest();
                LSE_Logger.debug(`[Fennel-NG DEBUG] Communication object created for user: ${authResult.username}`);
                LSE_Logger.debug(`[Fennel-NG DEBUG] Parsing URL with crossroads: ${originalUrl}`);
                crossroads.parse(originalUrl, [commobj]);
                LSE_Logger.debug(`[Fennel-NG DEBUG] Crossroads parsing completed`);
            }
            catch(error)
            {
                LSE_Logger.error(`[Fennel-NG] Internal Request processing error: ${error.message}`);
                LSE_Logger.error(`[Fennel-NG DEBUG] Error stack: ${error.stack}`);
                res.writeHead(500);
                res.end('Internal server error');
            }
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG] Authentication error: ${error.message}`);
            LSE_Logger.error(`[Fennel-NG DEBUG] Auth error stack: ${error.stack}`);
            res.writeHead(500);
            res.end('Authentication system error');
        });
    });
    req.on('error', function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Request error: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG DEBUG] Request error stack: ${error.stack}`);
        res.writeHead(400);
        res.end('Bad request');
    });
}
function getRoutes()
{
    return [
        { path: '/p', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT'] },
        { path: '/cal', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT', 'MKCALENDAR', 'PUT', 'GET', 'DELETE', 'MOVE'] },
        { path: '/card', methods: ['PROPFIND', 'PROPPATCH', 'OPTIONS', 'REPORT', 'PUT', 'GET', 'DELETE', 'MOVE'] },
        { path: '/.well-known', methods: ['GET'] },
        { path: '/', methods: ['GET'] }
    ];
}
function healthCheck()
{
    return Promise.all([
        redis.healthCheck(),
        db.healthCheck(),
        authlib.healthCheck()
    ]).then(function(results)
    {
        var redisHealth = results[0];
        var dbHealth = results[1];
        var authHealth = results[2];
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: config.version_nr,
            components: {
                redis: redisHealth,
                database: dbHealth,
                authentication: authHealth
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
function createExpressMiddleware() {
    return function(req, res, next) {
        var originalUrl = req.originalUrl || req.url;
        var prefix = config.public_route_prefix || '';
        var isFennelPath = prefix && originalUrl.startsWith(prefix);
        if (isFennelPath) {
            const allowedOrigins = [
                'https://marketing.lumanet.info',
                'https://atl-webcal01.lumanet.info',
                'http://localhost:3000'
            ];
            const origin = req.headers.origin;
            const isAllowedOrigin = allowedOrigins.includes(origin);
            const originalWriteHead = res.writeHead;
            res.writeHead = function(statusCode, headers) {
                if (isAllowedOrigin) {
                    const corsHeaders = {
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Credentials': 'true',
                        'Access-Control-Expose-Headers': 'ETag, DAV, Preference-Applied'
                    };
                    const mergedHeaders = Object.assign({}, corsHeaders, headers || {});
                    originalWriteHead.call(this, statusCode, mergedHeaders);
                } else {
                    originalWriteHead.call(this, statusCode, headers);
                }
            };
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            LSE_Logger.debug(`[Fennel-NG] Handling CalDAV/CardDAV request: ${originalUrl}`);
            handleRequest(req, res, next);
        } else {
            LSE_Logger.debug(`[Fennel-NG] Skipping non-CalDAV/CardDAV request: ${originalUrl}`);
            next();
        }
    };
}
function shutdown()
{
    LSE_Logger.info('[Fennel-NG] Shutting down CalDAV/CardDAV server');
    return Promise.all([
        redis.initializeRedis().then(function(client) {
            if(client && client.disconnect) {
                return client.disconnect();
            }
        }),
        db.sequelize.close()
    ]).then(function()
    {
        LSE_Logger.info('[Fennel-NG] Shutdown completed successfully');
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Shutdown error: ${error.message}`);
    });
}
module.exports = {
    initialize: initializeFennelNG,
    middleware: createExpressMiddleware,
    handleRequest: handleRequest,
    healthCheck: healthCheck,
    shutdown: shutdown,
    version: config.version_nr,
    routes: getRoutes
};
