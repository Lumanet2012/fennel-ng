var redis = require('./redis');
var config = require('../config').config;
class LDAPIntegration {
    constructor(config) {
        this.config = config;
        this.ldapClient = null;
    }
    async initializeClient() {
        if (this.ldapClient) {
            return this.ldapClient;
        }
        try {
            var ldapjs = require('ldapjs');
            this.ldapClient = ldapjs.createClient({
                url: this.config.auth_method_ldap_url,
                timeout: 5000,
                connectTimeout: 10000,
                idleTimeout: 30000
            });
            this.ldapClient.on('error', function(error) {
                LSE_Logger.error(`[Fennel-NG LDAP] Client error: ${error.message}`);
            });
            return this.ldapClient;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG LDAP] Failed to initialize LDAP client: ${error.message}`);
            throw error;
        }
    }
    async testConnection() {
        try {
            var client = await this.initializeClient();
            return new Promise((resolve) => {
                var testDN = this.config.auth_method_ldap_user_base_dn;
                var searchOptions = {
                    scope: 'base',
                    attributes: ['dn']
                };
                client.search(testDN, searchOptions, function(err, res) {
                    if (err) {
                        resolve({
                            success: false,
                            error: err.message
                        });
                        return;
                    }
                    var found = false;
                    res.on('searchEntry', function() {
                        found = true;
                    });
                    res.on('end', function() {
                        resolve({
                            success: found,
                            error: found ? null : 'No entries found'
                        });
                    });
                    res.on('error', function(error) {
                        resolve({
                            success: false,
                            error: error.message
                        });
                    });
                });
            });
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    async authenticateUser(username, password) {
        try {
            var cachedUser = await redis.getLDAPUser(username);
            if (cachedUser) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Using cached user data for: ${username}`);
                var Argon2Auth = require('./argon2-auth');
                var passwordValid = await Argon2Auth.verifyPassword(password, cachedUser.passwordHash);
                if (passwordValid) {
                    return {
                        success: true,
                        user: cachedUser,
                        groups: cachedUser.groups || [],
                        fromCache: true
                    };
                }
            }
            var client = await this.initializeClient();
            var userDN = `cn=${username},${this.config.auth_method_ldap_user_base_dn}`;
            LSE_Logger.debug(`[Fennel-NG LDAP] Attempting authentication for: ${userDN}`);
            return new Promise((resolve) => {
                client.bind(userDN, password, async (bindErr) => {
                    if (bindErr) {
                        LSE_Logger.warn(`[Fennel-NG LDAP] Authentication failed for ${username}: ${bindErr.message}`);
                        resolve({
                            success: false,
                            error: bindErr.message
                        });
                        return;
                    }
                    try {
                        var userGroups = await this.getUserGroups(username);
                        var hasRequiredGroup = userGroups.some(group => 
                            group.cn === this.config.auth_method_ldap_required_group
                        );
                        if (!hasRequiredGroup) {
                            LSE_Logger.warn(`[Fennel-NG LDAP] User ${username} not in required group: ${this.config.auth_method_ldap_required_group}`);
                            resolve({
                                success: false,
                                error: `User not in required group: ${this.config.auth_method_ldap_required_group}`
                            });
                            return;
                        }
                        var userData = {
                            username: username,
                            groups: userGroups,
                            lastAuthenticated: Math.floor(Date.now() / 1000)
                        };
                        await redis.cacheLDAPUser(username, userData, 300);
                        LSE_Logger.info(`[Fennel-NG LDAP] Authentication successful for: ${username}`);
                        resolve({
                            success: true,
                            user: userData,
                            groups: userGroups
                        });
                    } catch (groupError) {
                        LSE_Logger.error(`[Fennel-NG LDAP] Error getting user groups: ${groupError.message}`);
                        resolve({
                            success: false,
                            error: groupError.message
                        });
                    }
                });
            });
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG LDAP] Authentication error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async getUserGroups(username) {
        var client = await this.initializeClient();
        var groupBaseDN = this.config.auth_method_ldap_group_base_dn;
        var searchFilter = `(member=cn=${username},${this.config.auth_method_ldap_user_base_dn})`;
        var searchOptions = {
            scope: 'sub',
            filter: searchFilter,
            attributes: ['cn', 'description']
        };
        return new Promise((resolve, reject) => {
            var groups = [];
            client.search(groupBaseDN, searchOptions, function(err, res) {
                if (err) {
                    reject(err);
                    return;
                }
                res.on('searchEntry', function(entry) {
                    var group = {
                        cn: entry.object.cn,
                        description: entry.object.description || ''
                    };
                    groups.push(group);
                    LSE_Logger.debug(`[Fennel-NG LDAP] Found group for ${username}: ${group.cn}`);
                });
                res.on('end', function() {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Found ${groups.length} groups for user: ${username}`);
                    resolve(groups);
                });
                res.on('error', function(error) {
                    LSE_Logger.error(`[Fennel-NG LDAP] Group search error: ${error.message}`);
                    reject(error);
                });
            });
        });
    }
    async validateUserExists(username) {
        try {
            var cachedUser = await redis.getLDAPUser(username);
            if (cachedUser) {
                return {
                    exists: true,
                    user: cachedUser,
                    fromCache: true
                };
            }
            var client = await this.initializeClient();
            var userBaseDN = this.config.auth_method_ldap_user_base_dn;
            var searchFilter = `(cn=${username})`;
            var searchOptions = {
                scope: 'sub',
                filter: searchFilter,
                attributes: ['cn', 'mail', 'displayName']
            };
            return new Promise((resolve) => {
                var userFound = false;
                var userData = null;
                client.search(userBaseDN, searchOptions, function(err, res) {
                    if (err) {
                        resolve({
                            exists: false,
                            error: err.message
                        });
                        return;
                    }
                    res.on('searchEntry', function(entry) {
                        userFound = true;
                        userData = {
                            username: entry.object.cn,
                            email: entry.object.mail || '',
                            displayName: entry.object.displayName || entry.object.cn
                        };
                    });
                    res.on('end', function() {
                        resolve({
                            exists: userFound,
                            user: userData
                        });
                    });
                    res.on('error', function(error) {
                        resolve({
                            exists: false,
                            error: error.message
                        });
                    });
                });
            });
        } catch (error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }
    async disconnect() {
        if (this.ldapClient) {
            this.ldapClient.unbind();
            this.ldapClient = null;
            LSE_Logger.debug('[Fennel-NG LDAP] Disconnected from LDAP server');
        }
    }
}
module.exports = LDAPIntegration;

