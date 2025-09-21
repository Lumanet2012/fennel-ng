var config = require('./config').config;
var authlib = require('./libs/authentication');
var handler = require('./libs/requesthandler');
var communication = require('./libs/communication');
var redis = require('./libs/redis');
var db = require('./libs/db');
var httpauth = require('http-auth');
var crossroads = require('crossroads');
crossroads.ignoreState = true;
var basic = httpauth.basic(
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
            middleware: handleRequest,
            healthCheck: healthCheck,
            routes: getRoutes()
        };
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Initialization failed: ${error.message}`);
        throw error;
    });
}
function setupRoutes()
{
    crossroads.addRoute('/p/:params*:', onHitPrincipal);
    crossroads.addRoute('/cal/:username:/:cal:/:params*:', onHitCalendar);
    crossroads.addRoute('/card/:username:/:card:/:params*:', onHitCard);
    crossroads.addRoute('/.well-known/:params*:', onHitWellKnown);
    crossroads.addRoute('/', onHitRoot);
    crossroads.bypassed.add(onBypass);
    LSE_Logger.debug('[Fennel-NG] CalDAV/CardDAV routes configured');
}
function onBypass(comm, path)
{
    LSE_Logger.info(`[Fennel-NG] Unknown URL: ${path}`);
    var res = comm.getRes();
    res.writeHead(404);
    res.write(`${path} is not a valid CalDAV/CardDAV endpoint`);
    res.end();
}
function onHitRoot(comm)
{
    LSE_Logger.debug('[Fennel-NG] Called root, redirecting to /p/');
    comm.getRes().writeHead(302, {
        'Location': '/p/'
    });
    comm.flushResponse();
}
function onHitWellKnown(comm, params)
{
    LSE_Logger.debug(`[Fennel-NG] Called .well-known URL for ${params}, redirecting to /p/`);
    comm.getRes().writeHead(302, {
        'Location': '/p/'
    });
    comm.flushResponse();
}
function onHitPrincipal(comm, params)
{
    comm.params = params;
    if(!comm.checkPermission(comm.getURL(), comm.getReq().method))
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
function onHitCalendar(comm, username, cal, params)
{
    comm.username = username;
    comm.cal = cal;
    comm.params = params;
    if(!comm.checkPermission(comm.getURL(), comm.getReq().method))
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
function onHitCard(comm, username, card, params)
{
    comm.username = username;
    comm.card = card;
    comm.params = params;
    if(!comm.checkPermission(comm.getURL(), comm.getReq().method))
    {
        var res = comm.getRes();
        LSE_Logger.warn(`[Fennel-NG] CardDAV request denied for user: ${comm.getUser().getUserName()}`);
        res.writeHead(403);
        res.write("Access denied to this addressbook resource");
        res.end();
        return;
    }
    handler.handleCard(comm);
}
function handleRequest(req, res, next)
{
    LSE_Logger.debug(`[Fennel-NG] ${req.method} ${req.url}`);
    var reqBody = "";
    req.on('data', function (data)
    {
        reqBody += data.toString();
    });
    req.on('end', function()
    {
        authlib.authenticateRequest(req).then(function(authResult)
        {
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
                var comm = new communication(req, res, reqBody, authResult);
                var sUrl = require('url').parse(req.url).pathname;
                LSE_Logger.debug(`[Fennel-NG] Authenticated user: ${authResult.username}, processing: ${sUrl}`);
                crossroads.parse(sUrl, [comm]);
            }
            catch(error)
            {
                LSE_Logger.error(`[Fennel-NG] Request processing error: ${error.message}`);
                res.writeHead(500);
                res.end('Internal server error');
            }
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG] Authentication error: ${error.message}`);
            res.writeHead(500);
            res.end('Authentication system error');
        });
    });
    req.on('error', function(error)
    {
        LSE_Logger.error(`[Fennel-NG] Request error: ${error.message}`);
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
function createExpressMiddleware()
{
    return function(req, res, next)
    {
        var originalUrl = req.originalUrl || req.url;
        var isFennelPath = originalUrl.startsWith('/p/') || 
                          originalUrl.startsWith('/cal/') || 
                          originalUrl.startsWith('/card/') || 
                          originalUrl.startsWith('/.well-known/') ||
                          originalUrl === '/';
        if(isFennelPath)
        {
            LSE_Logger.debug(`[Fennel-NG] Handling CalDAV/CardDAV request: ${originalUrl}`);
            handleRequest(req, res, next);
        }
        else
        {
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
