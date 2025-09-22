var config = require('../config').config;
var redis = require('./redis');
var LDAPIntegration = require('./ldap-integration');
var jwt = require('jsonwebtoken');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
function checkLogin(basicAuth, username, password, callback)
{
    LSE_Logger.debug(`[Fennel-NG Auth] Login process started for user: ${username}`);
    switch(config.auth_method)
    {
        case 'ldap':
            checkLDAP(username, password, callback);
            break;
        case 'ldap_jwt':
            checkLDAP(username, password, callback);
            break;
        case 'jwt':
            callback(false);
            break;
        case 'htaccess':
            checkHtaccess(basicAuth, username, password, callback);
            break;
        case 'courier':
            checkCourier(username, password, callback);
            break;
        default:
            LSE_Logger.warn(`[Fennel-NG Auth] No authentication method defined: ${config.auth_method}`);
            callback(false);
            break;
    }
}
async function checkLDAP(username, password, callback)
{
    LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with LDAP method: ${username}`);
    try
    {
        var cachedUser = await redis.getLDAPUser(username);
        if(cachedUser)
        {
            LSE_Logger.debug(`[Fennel-NG Auth] Using cached LDAP data for: ${username}`);
            var Argon2Auth = require('./argon2-auth');
            var passwordValid = await Argon2Auth.verifyPassword(password, cachedUser.passwordHash);
            if(passwordValid)
            {
                var hasRequiredGroup = cachedUser.groups && cachedUser.groups.some(group =>
                    group.cn === config.auth_method_ldap_required_group
                );
                if(hasRequiredGroup)
                {
                    LSE_Logger.info(`[Fennel-NG Auth] User authenticated from cache: ${username}`);
                    callback({
                        success: true,
                        method: 'ldap',
                        username: username,
                        user: cachedUser,
                        authority: {
                            check: function(permission) {
                                return true;
                            }
                        }
                    });
                    return;
                }
                else
                {
                    LSE_Logger.warn(`[Fennel-NG Auth] Cached user ${username} not in required group: ${config.auth_method_ldap_required_group}`);
                }
            }
        }
        var ldapClient = new LDAPIntegration(config);
        var authResult = await ldapClient.authenticateUser(username, password);
        if(authResult.success)
        {
            var hasRequiredGroup = authResult.groups.some(group =>
                group.cn === config.auth_method_ldap_required_group
            );
            if(hasRequiredGroup)
            {
                if(!authResult.fromCache)
                {
                    var Argon2Auth = require('./argon2-auth');
                    var passwordHash = await Argon2Auth.hashPassword(password);
                    var userData = {
                        username: username,
                        passwordHash: passwordHash,
                        groups: authResult.groups,
                        lastAuthenticated: Math.floor(Date.now() / 1000)
                    };
                    await redis.cacheLDAPUser(username, userData, 300);
                }
                LSE_Logger.info(`[Fennel-NG Auth] User authenticated via LDAP: ${username}`);
                callback({
                    success: true,
                    method: 'ldap',
                    username: username,
                    user: authResult.user,
                    authority: {
                        check: function(permission) {
                            return true;
                        }
                    }
                });
                return;
            }
            else
            {
                LSE_Logger.warn(`[Fennel-NG Auth] User ${username} not in required group: ${config.auth_method_ldap_required_group}`);
            }
        }
        else
        {
            LSE_Logger.warn(`[Fennel-NG Auth] LDAP authentication failed for ${username}: ${authResult.error}`);
        }
        callback(false);
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] LDAP authentication error: ${error.message}`);
        callback(false);
    }
}
async function validateJWTToken(token)
{
    try
    {
        var isBlacklisted = await redis.isJWTTokenBlacklisted(token);
        if(isBlacklisted)
        {
            LSE_Logger.warn(`[Fennel-NG Auth] JWT token is blacklisted`);
            return {
                valid: false,
                error: 'Token is blacklisted'
            };
        }
        var cachedPayload = await redis.getJWTToken(token);
        if(cachedPayload)
        {
            LSE_Logger.debug(`[Fennel-NG Auth] Using cached JWT token`);
            return {
                valid: true,
                payload: cachedPayload,
                fromCache: true
            };
        }
        var decoded = jwt.verify(token, config.jwt_secret);
        var now = Math.floor(Date.now() / 1000);
        if(decoded.exp && decoded.exp < now)
        {
            LSE_Logger.warn(`[Fennel-NG Auth] JWT token expired`);
            return {
                valid: false,
                error: 'Token expired'
            };
        }
        if(config.auth_method === 'ldap_jwt' || config.auth_method === 'ldap')
        {
            if(!decoded.groups || !decoded.groups.includes(config.auth_method_ldap_required_group))
            {
                LSE_Logger.warn(`[Fennel-NG Auth] JWT token user not in required group: ${config.auth_method_ldap_required_group}`);
                return {
                    valid: false,
                    error: `User not in required group: ${config.auth_method_ldap_required_group}`
                };
            }
        }
        var cacheExpiry = decoded.exp ? (decoded.exp - now - 60) : (config.jwt_expiry_minutes * 60 - 300);
        if(cacheExpiry > 0)
        {
            await redis.cacheJWTToken(token, decoded, cacheExpiry);
        }
        LSE_Logger.debug(`[Fennel-NG Auth] JWT token validated successfully for user: ${decoded.username || decoded.sub}`);
        return {
            valid: true,
            payload: decoded
        };
    }
    catch(error)
    {
        LSE_Logger.warn(`[Fennel-NG Auth] JWT token validation failed: ${error.message}`);
        return {
            valid: false,
            error: error.message
        };
    }
}
async function extractJWTFromRequest(req)
{
    try
    {
        var token = null;
        if(req.headers.authorization)
        {
            var authHeader = req.headers.authorization;
            if(authHeader.startsWith('Bearer '))
            {
                token = authHeader.substring(7);
                LSE_Logger.debug(`[Fennel-NG Auth] JWT token found in Authorization header`);
            }
        }
        if(!token && req.headers.cookie)
        {
            var cookies = req.headers.cookie.split(';');
            for(var i = 0; i < cookies.length; i++)
            {
                var cookie = cookies[i].trim();
                if(cookie.startsWith(config.jwt_cookie_name + '='))
                {
                    token = cookie.substring(config.jwt_cookie_name.length + 1);
                    LSE_Logger.debug(`[Fennel-NG Auth] JWT token found in cookie: ${config.jwt_cookie_name}`);
                    break;
                }
            }
        }
        return token;
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Error extracting JWT token: ${error.message}`);
        return null;
    }
}
async function authenticateRequest(req)
{
    try
    {
        var jwtToken = await extractJWTFromRequest(req);
        if(jwtToken)
        {
            var jwtResult = await validateJWTToken(jwtToken);
            if(jwtResult.valid)
            {
                var username = jwtResult.payload.username || jwtResult.payload.sub;
                LSE_Logger.debug(`[Fennel-NG Auth] Request authenticated via JWT for user: ${username}`);
                return {
                    success: true,
                    method: 'jwt',
                    username: username,
                    payload: jwtResult.payload
                };
            }
            else
            {
                LSE_Logger.warn(`[Fennel-NG Auth] JWT authentication failed: ${jwtResult.error}`);
            }
        }
        var authHeader = req.headers.authorization;
        if(authHeader && authHeader.startsWith('Basic '))
        {
            var credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
            var [username, password] = credentials.split(':');
            
            if(username && password)
            {
                return new Promise((resolve) => {
                    checkLogin(null, username, password, function(success) {
                        if(success)
                        {
                            LSE_Logger.debug(`[Fennel-NG Auth] Request authenticated via Basic Auth for user: ${username}`);
                            resolve({
                                success: true,
                                method: 'basic',
                                username: username
                            });
                        }
                        else
                        {
                            LSE_Logger.warn(`[Fennel-NG Auth] Basic authentication failed for user: ${username}`);
                            resolve({
                                success: false,
                                error: 'Invalid credentials'
                            });
                        }
                    });
                });
            }
        }
        LSE_Logger.warn(`[Fennel-NG Auth] No valid authentication found in request`);
        return {
            success: false,
            error: 'No authentication provided'
        };
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Authentication error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}
async function blacklistJWTToken(token)
{
    try
    {
        var decoded = jwt.decode(token);
        var expirySeconds = decoded && decoded.exp ? (decoded.exp - Math.floor(Date.now() / 1000)) : 86400;
        await redis.blacklistJWTToken(token, expirySeconds);
        LSE_Logger.info(`[Fennel-NG Auth] JWT token blacklisted`);
        return true;
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Error blacklisting JWT token: ${error.message}`);
        return false;
    }
}
function checkHtaccess(basicAuth, username, password, callback)
{
    LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with htaccess method: ${username}`);
    var fHTAccess = path.resolve('.', config.auth_method_htaccess_file);
    if(!fs.existsSync(fHTAccess))
    {
        LSE_Logger.warn(`[Fennel-NG Auth] File not found for htaccess authentication: ${fHTAccess}`);
        callback(false);
        return;
    }
    var strHTAccess = fs.readFileSync(fHTAccess, 'utf8');
    var lines = strHTAccess.replace(/\r\n/g, "\n").split("\n");
    for (var i in lines)
    {
        var line = lines[i];
        if(line.length > 0)
        {
            var ret = processLine(line);
            if(ret.username == username)
            {
                if(basicAuth.validate(ret.passwordhash, password))
                {
                    LSE_Logger.info(`[Fennel-NG Auth] User authenticated via htaccess: ${username}`);
                    callback(true);
                    return;
                }
            }
        }
    }
    LSE_Logger.warn(`[Fennel-NG Auth] Htaccess authentication failed for user: ${username}`);
    callback(false);
}
function processLine(line)
{
    var pwdhash, lineSplit, username;
    lineSplit = line.split(":");
    username = lineSplit.shift();
    pwdhash = lineSplit.join(":");
    return new htaccessLine(username, pwdhash);
}
function htaccessLine(user, hash)
{
    this.username = user;
    this.passwordhash = hash;
}
function checkCourier(username, password, callback)
{
    LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with courier method: ${username}`);
    var net = require('net');
    var socketPath = config.auth_method_courier_socket;
    LSE_Logger.debug(`[Fennel-NG Auth] Using courier socket: ${socketPath}`);
    var client = net.createConnection({path: socketPath});
    client.on("connect", function() {
        var payload = 'service\nlogin\n' + username + '\n' + password;
        client.write('AUTH ' + payload.length + '\n' + payload);
    });
    var response = "";
    client.on("data", function(data) {
        response += data.toString();
    });
    client.on('end', function() {
        var result = response.indexOf('FAIL', 0);
        var success = result < 0;
        if(success)
        {
            LSE_Logger.info(`[Fennel-NG Auth] User authenticated via courier: ${username}`);
        }
        else
        {
            LSE_Logger.warn(`[Fennel-NG Auth] Courier authentication failed for user: ${username}`);
        }
        callback(success);
    });
    client.on('error', function(error) {
        LSE_Logger.error(`[Fennel-NG Auth] Courier authentication error: ${error.message}`);
        callback(false);
    });
}
async function healthCheck()
{
    try
    {
        var ldapHealth = { available: false };
        var redisHealth = await redis.healthCheck();
        if(config.auth_method === 'ldap' || config.auth_method === 'ldap_jwt')
        {
            try
            {
                var ldapClient = new LDAPIntegration(config);
                var connectionResult = await ldapClient.testConnection();
                ldapHealth = {
                    available: connectionResult.success,
                    error: connectionResult.error
                };
            }
            catch(error)
            {
                ldapHealth = {
                    available: false,
                    error: error.message
                };
            }
        }
        return {
            status: 'ok',
            method: config.auth_method,
            ldap: ldapHealth,
            redis: redisHealth,
            jwt_enabled: config.auth_method.includes('jwt')
        };
    }
    catch(error)
    {
        return {
            status: 'error',
            error: error.message
        };
    }
}
module.exports = {
    checkLogin: checkLogin,
    checkLDAP: checkLDAP,
    validateJWTToken: validateJWTToken,
    extractJWTFromRequest: extractJWTFromRequest,
    authenticateRequest: authenticateRequest,
    blacklistJWTToken: blacklistJWTToken,
    healthCheck: healthCheck
};

