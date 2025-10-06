var config = require('../config').config;
var redis = require('./redis');
var ldapintegration = require('./ldap-integration');
var jwt = require('jsonwebtoken');
var fs = require('fs');
var path = require('path');
var { hash } = require('blake3-wasm');
function checkLogin(basicauth, username, password, callback)
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
            checkHtaccess(basicauth, username, password, callback);
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
        var ldap_username = username.replace(/-/g, '@');
        var caldav_username = username.replace(/@/g, '-');
        LSE_Logger.debug(`[Fennel-NG Auth] LDAP username: ${ldap_username}, CalDAV username: ${caldav_username}`);
        var cacheduser = await redis.getLDAPUser(ldap_username);
        if(cacheduser)
        {
            LSE_Logger.debug(`[Fennel-NG Auth] Using cached LDAP data for: ${ldap_username}`);
            var argon2auth = require('./argon2-auth');
            var passwordvalid = await argon2auth.verifyPassword(password, cacheduser.passwordHash);
            if(passwordvalid)
            {
                var hasrequiredgroup = cacheduser.groups && cacheduser.groups.some(group =>
                    group.cn === config.auth_method_ldap_required_group
                );
                if(hasrequiredgroup)
                {
                    LSE_Logger.info(`[Fennel-NG Auth] User authenticated from cache: ${ldap_username}`);
                    callback({
                        success: true,
                        method: 'ldap',
                        username: caldav_username,
                        ldap_username: ldap_username,
                        user: cacheduser,
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
                    LSE_Logger.warn(`[Fennel-NG Auth] Cached user ${ldap_username} not in required group: ${config.auth_method_ldap_required_group}`);
                }
            }
        }
        var ldapclient = new ldapintegration(config);
        var authresult = await ldapclient.authenticateUser(ldap_username, password);
        if(authresult.success)
        {
            var hasrequiredgroup = authresult.groups.some(group =>
                group.cn === config.auth_method_ldap_required_group
            );
            if(hasrequiredgroup)
            {
                LSE_Logger.info(`[Fennel-NG Auth] User authenticated via LDAP: ${ldap_username}`);
                var userdata = {
                    username: ldap_username,
                    groups: authresult.groups,
                    passwordHash: authresult.user.passwordHash,
                    displayName: authresult.user.displayName || ldap_username
                };
                await redis.cacheLDAPUser(ldap_username, userdata, 300);
                callback({
                    success: true,
                    method: 'ldap',
                    username: caldav_username,
                    ldap_username: ldap_username,
                    user: authresult.user,
                    groups: authresult.groups,
                    authority: {
                        check: function(permission) {
                            return true;
                        }
                    }
                });
            }
            else
            {
                LSE_Logger.warn(`[Fennel-NG Auth] User ${ldap_username} not in required group: ${config.auth_method_ldap_required_group}`);
                callback(false);
            }
        }
        else
        {
            LSE_Logger.warn(`[Fennel-NG Auth] LDAP authentication failed for user: ${ldap_username}`);
            callback(false);
        }
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
        var isblacklisted = await redis.isJWTTokenBlacklisted(token);
        if(isblacklisted)
        {
            LSE_Logger.warn(`[Fennel-NG Auth] JWT token is blacklisted`);
            return {
                valid: false,
                error: 'Token is blacklisted'
            };
        }
        var cachedpayload = await redis.getJWTToken(token);
        if(cachedpayload)
        {
            LSE_Logger.debug(`[Fennel-NG Auth] Using cached JWT token`);
            return {
                valid: true,
                payload: cachedpayload,
                fromcache: true
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
        var cacheexpiry = decoded.exp ?
            (decoded.exp - now - 60) : (config.jwt_expiry_minutes * 60 - 300);
        if(cacheexpiry > 0)
        {
            await redis.cacheJWTToken(token, decoded, cacheexpiry);
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
            var authheader = req.headers.authorization;
            if(authheader.startsWith('Bearer '))
            {
                token = authheader.substring(7);
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
        var jwttoken = await extractJWTFromRequest(req);
        if(jwttoken)
        {
            var jwtresult = await validateJWTToken(jwttoken);
            if(jwtresult.valid)
            {
                var username = jwtresult.payload.username || jwtresult.payload.sub;
                var caldav_username = username.replace(/@/g, '-');
                LSE_Logger.debug(`[Fennel-NG Auth] Request authenticated via JWT for user: ${username}`);
                return {
                    success: true,
                    method: 'jwt',
                    username: caldav_username,
                    ldap_username: username,
                    payload: jwtresult.payload,
                    token: jwttoken
                };
            }
            else
            {
                LSE_Logger.warn(`[Fennel-NG Auth] JWT authentication failed: ${jwtresult.error}`);
            }
        }
        var authheader = req.headers.authorization;
        if(authheader && authheader.startsWith('Basic '))
        {
            var credentials = Buffer.from(authheader.substring(6), 'base64').toString();
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
                                username: success.username,
                                ldap_username: success.ldap_username
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
        var expiryseconds = decoded && decoded.exp ? (decoded.exp - Math.floor(Date.now() / 1000)) : 86400;
        await redis.blacklistJWTToken(token, expiryseconds);
        LSE_Logger.info(`[Fennel-NG Auth] JWT token blacklisted`);
        return true;
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Error blacklisting JWT token: ${error.message}`);
        return false;
    }
}
function checkHtaccess(basicauth, username, password, callback)
{
    LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with htaccess method: ${username}`);
    var fhtaccess = path.resolve('.', config.auth_method_htaccess_file);
    if(!fs.existsSync(fhtaccess))
    {
        LSE_Logger.warn(`[Fennel-NG Auth] File not found for htaccess authentication: ${fhtaccess}`);
        callback(false);
        return;
    }
    var strhtaccess = fs.readFileSync(fhtaccess, 'utf8');
    var lines = strhtaccess.replace(/\r\n/g, "\n").split("\n");
    for (var i in lines)
    {
        var line = lines[i];
        if(line.length > 0)
        {
            var ret = processLine(line);
            if(ret.username == username)
            {
                if(basicauth.validate(ret.passwordhash, password))
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
    var pwdhash, linesplit, username;
    linesplit = line.split(":");
    username = linesplit.shift();
    pwdhash = linesplit.join(":");
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
    var fcourier = path.resolve('.', config.auth_method_courier_socket);
    if(!fs.existsSync(fcourier))
    {
        LSE_Logger.warn(`[Fennel-NG Auth] Socket not found for courier authentication: ${fcourier}`);
        callback(false);
        return;
    }
    var net = require('net');
    var socket = net.connect(fcourier);
    socket.on('connect', function()
    {
        socket.write('AUTH ' + Buffer.from(username + '\n' + password + '\n').toString('hex') + '\n');
    });
    socket.on('data', function(data)
    {
        var response = data.toString();
        if(response.indexOf('FAIL') === -1)
        {
            LSE_Logger.info(`[Fennel-NG Auth] User authenticated via courier: ${username}`);
            callback(true);
        }
        else
        {
            LSE_Logger.warn(`[Fennel-NG Auth] Courier authentication failed for user: ${username}`);
            callback(false);
        }
        socket.end();
    });
    socket.on('error', function(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Courier socket error: ${error.message}`);
        callback(false);
    });
}
module.exports = {
    checkLogin: checkLogin,
    checkLDAP: checkLDAP,
    validateJWTToken: validateJWTToken,
    extractJWTFromRequest: extractJWTFromRequest,
    authenticateRequest: authenticateRequest,
    blacklistJWTToken: blacklistJWTToken,
    checkHtaccess: checkHtaccess,
    checkCourier: checkCourier
};
