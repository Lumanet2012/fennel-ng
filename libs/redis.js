var Redis = require('ioredis');
var config = require('../config').config;
var redis;
var isConnected = false;
function initializeRedis()
{
    if(redis && isConnected)
    {
        return redis;
    }
    var redisConfig = {
        host: config.redis_host || '127.0.0.1',
        port: config.redis_port || 6379,
        password: config.redis_password || null,
        db: config.redis_db || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000
    };
    redis = new Redis(redisConfig);
    redis.on('connect', function()
    {
        isConnected = true;
        LSE_Logger.info(`[Fennel-NG Redis] Connected to Redis at ${redisConfig.host}:${redisConfig.port}`);
    });
    redis.on('error', function(error)
    {
        isConnected = false;
        LSE_Logger.error(`[Fennel-NG Redis] Redis connection error: ${error.message}`);
    });
    redis.on('close', function()
    {
        isConnected = false;
        LSE_Logger.warn(`[Fennel-NG Redis] Redis connection closed`);
    });
    redis.on('reconnecting', function()
    {
        LSE_Logger.info(`[Fennel-NG Redis] Reconnecting to Redis...`);
    });
    return redis;
}
function getCalendarSyncToken(calendarUri, username)
{
    var client = initializeRedis();
    var key = `caldav:calendar:sync:${username}:${calendarUri}`;
    return client.get(key).then(function(result)
    {
        if(result)
        {
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved calendar sync token: ${key} = ${result}`);
        }
        return result;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error getting calendar sync token: ${error.message}`);
        return null;
    });
}
function setCalendarSyncToken(calendarUri, username, syncToken)
{
    var client = initializeRedis();
    var key = `caldav:calendar:sync:${username}:${calendarUri}`;
    return client.set(key, syncToken, 'EX', 86400).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Set calendar sync token: ${key} = ${syncToken}`);
        return syncToken;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error setting calendar sync token: ${error.message}`);
        return syncToken;
    });
}
function incrementCalendarSyncToken(calendarUri, username)
{
    var client = initializeRedis();
    var key = `caldav:calendar:sync:${username}:${calendarUri}`;
    return client.incr(key).then(function(newToken)
    {
        client.expire(key, 86400);
        LSE_Logger.debug(`[Fennel-NG Redis] Incremented calendar sync token: ${key} = ${newToken}`);
        return newToken;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error incrementing calendar sync token: ${error.message}`);
        return Math.floor(Date.now() / 1000);
    });
}
function getAddressbookSyncToken(addressbookUri, username)
{
    var client = initializeRedis();
    var key = `carddav:addressbook:sync:${username}:${addressbookUri}`;
    return client.get(key).then(function(result)
    {
        if(result)
        {
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved addressbook sync token: ${key} = ${result}`);
        }
        return result;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error getting addressbook sync token: ${error.message}`);
        return null;
    });
}
function setAddressbookSyncToken(addressbookUri, username, syncToken)
{
    var client = initializeRedis();
    var key = `carddav:addressbook:sync:${username}:${addressbookUri}`;
    return client.set(key, syncToken, 'EX', 86400).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Set addressbook sync token: ${key} = ${syncToken}`);
        return syncToken;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error setting addressbook sync token: ${error.message}`);
        return syncToken;
    });
}
function incrementAddressbookSyncToken(addressbookUri, username)
{
    var client = initializeRedis();
    var key = `carddav:addressbook:sync:${username}:${addressbookUri}`;
    return client.incr(key).then(function(newToken)
    {
        client.expire(key, 86400);
        LSE_Logger.debug(`[Fennel-NG Redis] Incremented addressbook sync token: ${key} = ${newToken}`);
        return newToken;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error incrementing addressbook sync token: ${error.message}`);
        return Math.floor(Date.now() / 1000);
    });
}
function deleteAddressbookSyncToken(addressbookUri, username)
{
    var client = initializeRedis();
    var key = `carddav:addressbook:sync:${username}:${addressbookUri}`;
    return client.del(key).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Deleted addressbook sync token: ${key}`);
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error deleting addressbook sync token: ${error.message}`);
    });
}
function cacheJWTToken(token, payload, expirySeconds)
{
    var client = initializeRedis();
    var key = `jwt:token:${token}`;
    var cacheData = {
        payload: payload,
        cached_at: Math.floor(Date.now() / 1000)
    };
    var ttl = expirySeconds || (config.jwt_expiry_minutes * 60 - 300);
    return client.setex(key, ttl, JSON.stringify(cacheData)).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Cached JWT token for ${ttl} seconds`);
        return payload;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error caching JWT token: ${error.message}`);
        return payload;
    });
}
function getJWTToken(token)
{
    var client = initializeRedis();
    var key = `jwt:token:${token}`;
    return client.get(key).then(function(result)
    {
        if(result)
        {
            var cacheData = JSON.parse(result);
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved cached JWT token`);
            return cacheData.payload;
        }
        return null;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error getting JWT token: ${error.message}`);
        return null;
    });
}
function blacklistJWTToken(token, expirySeconds)
{
    var client = initializeRedis();
    var key = `jwt:blacklist:${token}`;
    return client.setex(key, expirySeconds || 86400, '1').then(function()
    {
        LSE_Logger.info(`[Fennel-NG Redis] Blacklisted JWT token`);
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error blacklisting JWT token: ${error.message}`);
    });
}
function isJWTTokenBlacklisted(token)
{
    var client = initializeRedis();
    var key = `jwt:blacklist:${token}`;
    return client.exists(key).then(function(exists)
    {
        return exists === 1;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error checking JWT blacklist: ${error.message}`);
        return false;
    });
}
function cacheLDAPUser(username, userData, expirySeconds)
{
    var client = initializeRedis();
    var key = `ldap:user:${username}`;
    var cacheData = {
        user: userData,
        cached_at: Math.floor(Date.now() / 1000)
    };
    return client.setex(key, expirySeconds || 300, JSON.stringify(cacheData)).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Cached LDAP user: ${username} for ${expirySeconds || 300} seconds`);
        return userData;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error caching LDAP user: ${error.message}`);
        return userData;
    });
}
function getLDAPUser(username)
{
    var client = initializeRedis();
    var key = `ldap:user:${username}`;
    return client.get(key).then(function(result)
    {
        if(result)
        {
            var cacheData = JSON.parse(result);
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved cached LDAP user: ${username}`);
            return cacheData.user;
        }
        return null;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error getting LDAP user: ${error.message}`);
        return null;
    });
}
function setSessionData(sessionId, sessionData, expirySeconds)
{
    var client = initializeRedis();
    var key = `session:${sessionId}`;
    return client.setex(key, expirySeconds || 3600, JSON.stringify(sessionData)).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Set session data: ${sessionId}`);
        return sessionData;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error setting session data: ${error.message}`);
        return sessionData;
    });
}
function getSessionData(sessionId)
{
    var client = initializeRedis();
    var key = `session:${sessionId}`;
    return client.get(key).then(function(result)
    {
        if(result)
        {
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved session data: ${sessionId}`);
            return JSON.parse(result);
        }
        return null;
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error getting session data: ${error.message}`);
        return null;
    });
}
function deleteSessionData(sessionId)
{
    var client = initializeRedis();
    var key = `session:${sessionId}`;
    return client.del(key).then(function()
    {
        LSE_Logger.debug(`[Fennel-NG Redis] Deleted session data: ${sessionId}`);
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG Redis] Error deleting session data: ${error.message}`);
    });
}
function healthCheck()
{
    var client = initializeRedis();
    return client.ping().then(function(result)
    {
        return {
            status: 'ok',
            connected: isConnected,
            response: result
        };
    }).catch(function(error)
    {
        return {
            status: 'error',
            connected: false,
            error: error.message
        };
    });
}
module.exports = {
    initializeRedis: initializeRedis,
    getCalendarSyncToken: getCalendarSyncToken,
    setCalendarSyncToken: setCalendarSyncToken,
    incrementCalendarSyncToken: incrementCalendarSyncToken,
    getAddressbookSyncToken: getAddressbookSyncToken,
    setAddressbookSyncToken: setAddressbookSyncToken,
    incrementAddressbookSyncToken: incrementAddressbookSyncToken,
    deleteAddressbookSyncToken: deleteAddressbookSyncToken,
    cacheJWTToken: cacheJWTToken,
    getJWTToken: getJWTToken,
    blacklistJWTToken: blacklistJWTToken,
    isJWTTokenBlacklisted: isJWTTokenBlacklisted,
    cacheLDAPUser: cacheLDAPUser,
    getLDAPUser: getLDAPUser,
    setSessionData: setSessionData,
    getSessionData: getSessionData,
    deleteSessionData: deleteSessionData,
    healthCheck: healthCheck
};
