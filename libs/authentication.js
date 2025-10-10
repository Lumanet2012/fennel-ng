const config = require('../config').config;
const redis = require('./redis');
const ldapintegration = require('./ldap-integration');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
function checklogin(basicauth, username, password, callback)
{
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG Auth] Login process started for user: ${username}`);
    }
    switch(config.auth_method)
    {
        case 'ldap':
            checkldap(username, password, callback);
            break;
        case 'ldap_jwt':
            checkldap(username, password, callback);
            break;
        case 'jwt':
            callback(false);
            break;
        case 'htaccess':
            checkhtaccess(basicauth, username, password, callback);
            break;
        case 'courier':
            checkcourier(username, password, callback);
            break;
        default:
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG Auth] No authentication method defined: ${config.auth_method}`);
            }
            callback(false);
            break;
    }
}
async function checkldap(username, password, callback)
{
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with LDAP method: ${username}`);
    }
    try
    {
        const ldap_username = username.replace(/-/g, '@');
        const caldav_username = username.replace(/@/g, '-');
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG Auth] LDAP username: ${ldap_username}, CalDAV username: ${caldav_username}`);
        }
        const cacheduser = await redis.getldapuser(ldap_username);
        if(cacheduser)
        {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG Auth] Using cached LDAP data for: ${ldap_username}`);
            }
            const argon2auth = require('./argon2-auth');
            const passwordvalid = await argon2auth.verifypassword(password, cacheduser.passwordHash);
            if(passwordvalid)
            {
                const hasrequiredgroup = cacheduser.groups && cacheduser.groups.some(group =>
                    group.cn === config.auth_method_ldap_required_group
                );
                if(hasrequiredgroup)
                {
                    if(config.LSE_Loglevel >= 1) {
                        LSE_Logger.info(`[Fennel-NG Auth] User authenticated from cache: ${ldap_username}`);
                    }
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
                    if(config.LSE_Loglevel >= 1) {
                        LSE_Logger.warn(`[Fennel-NG Auth] Cached user ${ldap_username} not in required group: ${config.auth_method_ldap_required_group}`);
                    }
                }
            }
        }
        const ldapclient = new ldapintegration(config);
        const authresult = await ldapclient.authenticateuser(ldap_username, password);
        if(authresult.success)
        {
            const hasrequiredgroup = authresult.groups.some(group =>
                group.cn === config.auth_method_ldap_required_group
            );
            if(hasrequiredgroup)
            {
                if(!authresult.fromCache)
                {
                    const argon2auth = require('./argon2-auth');
                    const passwordhash = await argon2auth.hashpassword(password);
                    const userdata = {
                        username: ldap_username,
                        passwordHash: passwordhash,
                        groups: authresult.groups,
                        lastAuthenticated: Math.floor(Date.now() / 1000)
                    };
                    await redis.cacheldapuser(ldap_username, userdata, 300);
                }
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.info(`[Fennel-NG Auth] User authenticated via LDAP: ${ldap_username}`);
                }
                callback({
                    success: true,
                    method: 'ldap',
                    username: caldav_username,
                    ldap_username: ldap_username,
                    user: authresult.user,
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
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG Auth] User ${ldap_username} not in required group: ${config.auth_method_ldap_required_group}`);
                }
            }
        }
        else
        {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG Auth] LDAP authentication failed for ${ldap_username}: ${authresult.error}`);
            }
        }
        callback(false);
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] LDAP authentication error: ${error.message}`);
        callback(false);
    }
}
async function validatejwttoken(token)
{
    try
    {
        const isblacklisted = await redis.isjwttokenblacklisted(token);
        if(isblacklisted)
        {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG Auth] JWT token is blacklisted`);
            }
            return {
                valid: false,
                error: 'Token is blacklisted'
            };
        }
        const cachedpayload = await redis.getjwttoken(token);
        if(cachedpayload)
        {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG Auth] Using cached JWT token`);
            }
            return {
                valid: true,
                payload: cachedpayload,
                fromCache: true
            };
        }
        const decoded = jwt.verify(token, config.jwt_secret);
        const now = Math.floor(Date.now() / 1000);
        if(decoded.exp && decoded.exp < now)
        {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG Auth] JWT token expired`);
            }
            return {
                valid: false,
                error: 'Token expired'
            };
        }
        if(config.auth_method === 'ldap_jwt' || config.auth_method === 'ldap')
        {
            if(!decoded.groups || !decoded.groups.includes(config.auth_method_ldap_required_group))
            {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG Auth] JWT token user not in required group: ${config.auth_method_ldap_required_group}`);
                }
                return {
                    valid: false,
                    error: `User not in required group: ${config.auth_method_ldap_required_group}`
                };
            }
        }
        const cacheexpiry = decoded.exp ? (decoded.exp - now) : 3600;
        await redis.cachejwttoken(token, decoded, cacheexpiry);
        if(config.LSE_Loglevel >= 2) {
            LSE_Logger.debug(`[Fennel-NG Auth] JWT token validated and cached`);
        }
        return {
            valid: true,
            payload: decoded,
            fromCache: false
        };
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] JWT validation error: ${error.message}`);
        return {
            valid: false,
            error: error.message
        };
    }
}
async function extractjwtfromrequest(req)
{
    try
    {
        let token = null;
        const authheader = req.headers.authorization;
        if(authheader && authheader.startsWith('Bearer '))
        {
            token = authheader.substring(7);
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG Auth] JWT token extracted from Authorization header`);
            }
            return token;
        }
        const cookieheader = req.headers.cookie;
        if(cookieheader)
        {
            const cookies = cookieheader.split(';');
            for(let cookie of cookies)
            {
                const [name, value] = cookie.trim().split('=');
                if(name === 'LSE_token' && value)
                {
                    token = decodeURIComponent(value);
                    if(config.LSE_Loglevel >= 2) {
                        LSE_Logger.debug(`[Fennel-NG Auth] JWT token extracted from LSE_token cookie`);
                    }
                    return token;
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
async function authenticaterequest(req)
{
    try
    {
        const jwttoken = await extractjwtfromrequest(req);
        if(jwttoken)
        {
            const jwtresult = await validatejwttoken(jwttoken);
            if(jwtresult.valid)
            {
                const username = jwtresult.payload.username || jwtresult.payload.sub;
                const caldav_username = username.replace(/@/g, '-');
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG Auth] Request authenticated via JWT for user: ${username}`);
                }
                return {
                    success: true,
                    method: 'jwt',
                    username: caldav_username,
                    ldap_username: username,
                    payload: jwtresult.payload
                };
            }
            else
            {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG Auth] JWT authentication failed: ${jwtresult.error}`);
                }
            }
        }
        const authheader = req.headers.authorization;
        if(authheader && authheader.startsWith('Basic '))
        {
            const credentials = Buffer.from(authheader.substring(6), 'base64').toString();
            const [username, password] = credentials.split(':');
            if(username && password)
            {
                return new Promise((resolve) => {
                    checklogin(null, username, password, function(success) {
                        if(success)
                        {
                            if(config.LSE_Loglevel >= 2) {
                                LSE_Logger.debug(`[Fennel-NG Auth] Request authenticated via Basic Auth for user: ${username}`);
                            }
                            resolve({
                                success: true,
                                method: 'basic',
                                username: success.username,
                                ldap_username: success.ldap_username
                            });
                        }
                        else
                        {
                            if(config.LSE_Loglevel >= 1) {
                                LSE_Logger.warn(`[Fennel-NG Auth] Basic authentication failed for user: ${username}`);
                            }
                            resolve({
                                success: false,
                                error: 'Invalid credentials'
                            });
                        }
                    });
                });
            }
        }
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.warn(`[Fennel-NG Auth] No valid authentication found in request`);
        }
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
async function blacklistjwttoken(token)
{
    try
    {
        const decoded = jwt.decode(token);
        const expiryseconds = decoded && decoded.exp ? (decoded.exp - Math.floor(Date.now() / 1000)) : 86400;
        await redis.blacklistjwttoken(token, expiryseconds);
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info(`[Fennel-NG Auth] JWT token blacklisted`);
        }
        return true;
    }
    catch(error)
    {
        LSE_Logger.error(`[Fennel-NG Auth] Error blacklisting JWT token: ${error.message}`);
        return false;
    }
}
function checkhtaccess(basicauth, username, password, callback)
{
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with htaccess method: ${username}`);
    }
    const fhtaccess = path.resolve('.', config.auth_method_htaccess_file);
    if(!fs.existsSync(fhtaccess))
    {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.warn(`[Fennel-NG Auth] File not found for htaccess authentication: ${fhtaccess}`);
        }
        callback(false);
        return;
    }
    const strhtaccess = fs.readFileSync(fhtaccess, 'utf8');
    const lines = strhtaccess.replace(/\r\n/g, "\n").split("\n");
    for (let i in lines)
    {
        const line = lines[i];
        if(line.length > 0)
        {
            const ret = processline(line);
            if(ret.username == username)
            {
                if(basicauth.validate(ret.passwordhash, password))
                {
                    if(config.LSE_Loglevel >= 1) {
                        LSE_Logger.info(`[Fennel-NG Auth] User authenticated via htaccess: ${username}`);
                    }
                    callback(true);
                    return;
                }
            }
        }
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.warn(`[Fennel-NG Auth] Htaccess authentication failed for user: ${username}`);
    }
    callback(false);
}
function processline(line)
{
    let pwdhash, linesplit, username;
    linesplit = line.split(":");
    username = linesplit.shift();
    pwdhash = linesplit.join(":");
    return new htaccessline(username, pwdhash);
}
function htaccessline(user, hash)
{
    this.username = user;
    this.passwordhash = hash;
}
function checkcourier(username, password, callback)
{
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG Auth] Authenticating user with courier method: ${username}`);
    }
    const net = require('net');
    const socketpath = config.auth_method_courier_socket;
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG Auth] Using courier socket: ${socketpath}`);
    }
    const client = net.createConnection({path: socketpath});
    client.on("connect", function() {
        const payload = 'service\nlogin\n' + username + '\n' + password;
        client.write('AUTH ' + payload.length + '\n' + payload);
    });
    let response = "";
    client.on("data", function(data) {
        response += data.toString();
    });
    client.on('end', function() {
        const result = response.indexOf('FAIL', 0);
        const success = result < 0;
        if(success)
        {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info(`[Fennel-NG Auth] User authenticated via courier: ${username}`);
            }
        }
        else
        {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn(`[Fennel-NG Auth] Courier authentication failed for user: ${username}`);
            }
        }
        callback(success);
    });
    client.on('error', function(error) {
        LSE_Logger.error(`[Fennel-NG Auth] Courier authentication error: ${error.message}`);
        callback(false);
    });
}
async function healthcheck()
{
    try
    {
        let ldaphealth = { available: false };
        const redishealth = await redis.healthcheck();
        if(config.auth_method === 'ldap' || config.auth_method === 'ldap_jwt')
        {
            try
            {
                const ldapclient = new ldapintegration(config);
                const connectionresult = await ldapclient.testconnection();
                ldaphealth = {
                    available: connectionresult.success,
                    error: connectionresult.error
                };
            }
            catch(error)
            {
                ldaphealth = {
                    available: false,
                    error: error.message
                };
            }
        }
        return {
            status: 'ok',
            method: config.auth_method,
            ldap: ldaphealth,
            redis: redishealth,
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
    checklogin: checklogin,
    checkldap: checkldap,
    validatejwttoken: validatejwttoken,
    extractjwtfromrequest: extractjwtfromrequest,
    authenticaterequest: authenticaterequest,
    blacklistjwttoken: blacklistjwttoken,
    healthcheck: healthcheck
};

