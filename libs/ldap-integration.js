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
            const { Client } = require('ldapts');
            this.ldapClient = new Client({
                url: this.config.auth_method_ldap_url,
                timeout: 5000,
                connectTimeout: 10000,
                idleTimeout: 30000
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
            var testDN = this.config.auth_method_ldap_user_base_dn;
            var searchOptions = {
                scope: 'base',
                attributes: ['dn']
            };
            try {
                const { searchEntries } = await client.search(testDN, searchOptions);
                return {
                    success: searchEntries.length > 0,
                    error: searchEntries.length > 0 ? null : 'No entries found'
                };
            } catch (searchError) {
                return {
                    success: false,
                    error: searchError.message
                };
            }
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
                var passwordValid = await this.verifyPassword(password, cachedUser.passwordHash);
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
            if (this.config.auth_method_ldap_admin_dn && this.config.auth_method_ldap_admin_password) {
                await client.bind(this.config.auth_method_ldap_admin_dn, this.config.auth_method_ldap_admin_password);
                LSE_Logger.debug(`[Fennel-NG LDAP] Admin service account bind successful`);
            }
            var userBaseDN = this.config.auth_method_ldap_user_base_dn;
            var requiredGroup = this.config.auth_method_ldap_required_group;
            var searchFilter = `(uid=${username})`;
            var searchOptions = {
                scope: 'sub',
                filter: searchFilter,
                attributes: ['uid', 'cn', 'memberOf', 'mail', 'displayName', 'userPassword']
            };
            LSE_Logger.debug(`[Fennel-NG LDAP] Searching for user: ${username} in ${userBaseDN}`);
            const { searchEntries } = await client.search(userBaseDN, searchOptions);
            if (searchEntries.length === 0) {
                LSE_Logger.warn(`[Fennel-NG LDAP] User not found: ${username}`);
                return {
                    success: false,
                    error: 'User not found'
                };
            }
            var userEntry = searchEntries[0];
            var userDN = userEntry.dn;
            var userUid = userEntry.uid;
            LSE_Logger.debug(`[Fennel-NG LDAP] Found user: ${username} with UID: ${userUid} at DN: ${userDN}`);
            var groupBaseDN = this.config.auth_method_ldap_group_base_dn;
            var groupFilter = `(&(cn=${requiredGroup})(member=${userDN}))`;
            var groupOptions = {
                scope: 'sub',
                filter: groupFilter,
                attributes: ['cn']
            };
            LSE_Logger.debug(`[Fennel-NG LDAP] Checking group membership: ${groupFilter}`);
            const { searchEntries: groupEntries } = await client.search(groupBaseDN, groupOptions);
            var hasCalDAVAccess = groupEntries.length > 0;
            if (!hasCalDAVAccess) {
                LSE_Logger.warn(`[Fennel-NG LDAP] User ${username} not found in required group: ${requiredGroup}`);
                return {
                    success: false,
                    error: `User not authorized for CalDAV access - missing group: ${requiredGroup}`
                };
            }
            LSE_Logger.debug(`[Fennel-NG LDAP] User ${username} confirmed in group: ${requiredGroup}`);
            var ldapPasswordHash = userEntry.userPassword;
            var passwordValid = await this.verifyPassword(password, ldapPasswordHash);
            if (!passwordValid) {
                LSE_Logger.warn(`[Fennel-NG LDAP] Password verification failed for ${username}`);
                return {
                    success: false,
                    error: 'Invalid password'
                };
            }
            LSE_Logger.info(`[Fennel-NG LDAP] Authentication successful for: ${username} (${userUid})`);
            var userData = {
                username: username,
                uid: userUid,
                email: userEntry.mail || '',
                displayName: userEntry.displayName || username,
                passwordHash: ldapPasswordHash,
                groups: [{ cn: requiredGroup }],
                lastAuthenticated: Math.floor(Date.now() / 1000)
            };
            await redis.cacheLDAPUser(username, userData, 300);
            return {
                success: true,
                user: userData,
                groups: [{ cn: requiredGroup }]
            };
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG LDAP] Authentication error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
async verifyPassword(password, storedHash) {
    try {
        if (!storedHash) {
            LSE_Logger.warn(`[Fennel-NG LDAP] No password hash provided for verification`);
            return false;
        }
        var hashString = Buffer.isBuffer(storedHash) ? storedHash.toString() :
                        Array.isArray(storedHash) ? storedHash[0].toString() :
                        storedHash.toString();
        LSE_Logger.debug(`[Fennel-NG LDAP] Password hash type: ${typeof storedHash}, value: ${hashString}`);
        if (hashString.startsWith('{ARGON2}')) {
            var argon2Hash = hashString.substring(8).replace(/\\\$/g, '$');
            var Argon2Auth = require('./argon2-auth');
            var result = await Argon2Auth.verifyPassword(password, argon2Hash);
            LSE_Logger.debug(`[Fennel-NG LDAP] Argon2 verification result: ${result}`);
            return result;
        }
        else {
            var result = (hashString === password);
            LSE_Logger.debug(`[Fennel-NG LDAP] Cleartext verification result: ${result}`);
            return result;
        }
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG LDAP] Password verification error: ${error.message}`);
        return false;
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
        try {
            const { searchEntries } = await client.search(groupBaseDN, searchOptions);
            var groups = searchEntries.map(entry => ({
                cn: entry.cn,
                description: entry.description || ''
            }));
            LSE_Logger.debug(`[Fennel-NG LDAP] Found ${groups.length} groups for user: ${username}`);
            groups.forEach(group => {
                LSE_Logger.debug(`[Fennel-NG LDAP] Found group for ${username}: ${group.cn}`);
            });
            return groups;
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG LDAP] Group search error: ${error.message}`);
            throw error;
        }
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
            var searchFilter = `(uid=${username})`;
            var searchOptions = {
                scope: 'sub',
                filter: searchFilter,
                attributes: ['uid', 'cn', 'mail', 'displayName']
            };
            try {
                const { searchEntries } = await client.search(userBaseDN, searchOptions);
                if (searchEntries.length > 0) {
                    var entry = searchEntries[0];
                    var userData = {
                        username: entry.uid,
                        email: entry.mail || '',
                        displayName: entry.displayName || entry.cn
                    };
                    return {
                        exists: true,
                        user: userData
                    };
                } else {
                    return {
                        exists: false,
                        user: null
                    };
                }
            } catch (searchError) {
                return {
                    exists: false,
                    error: searchError.message
                };
            }
        } catch (error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }
    async disconnect() {
        if (this.ldapClient) {
            try {
                await this.ldapClient.unbind();
            } catch (error) {
                LSE_Logger.warn(`[Fennel-NG LDAP] Error during disconnect: ${error.message}`);
            }
            this.ldapClient = null;
            LSE_Logger.debug('[Fennel-NG LDAP] Disconnected from LDAP server');
        }
    }
}
module.exports = LDAPIntegration;
