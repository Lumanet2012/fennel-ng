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
                attributes: ['uid', 'cn', 'mail', 'displayName', 'userPassword']
            };
            const { searchEntries } = await client.search(userBaseDN, searchOptions);
            if (!searchEntries || searchEntries.length === 0) {
                LSE_Logger.warn(`[Fennel-NG LDAP] User not found: ${username}`);
                return {
                    success: false,
                    error: 'User not found'
                };
            }
            var userEntry = searchEntries[0];
            var userUid = userEntry.uid;
            var userDN = userEntry.dn;
            LSE_Logger.debug(`[Fennel-NG LDAP] User found: ${userUid}, DN: ${userDN}`);
            var groupBaseDN = this.config.auth_method_ldap_group_base_dn;
            var groupSearchFilter = `(&(objectClass=groupOfNames)(cn=${requiredGroup})(member=${userDN}))`;
            var groupSearchOptions = {
                scope: 'sub',
                filter: groupSearchFilter,
                attributes: ['cn']
            };
            const groupResult = await client.search(groupBaseDN, groupSearchOptions);
            if (!groupResult.searchEntries || groupResult.searchEntries.length === 0) {
                LSE_Logger.warn(`[Fennel-NG LDAP] User ${username} not in required group: ${requiredGroup}`);
                return {
                    success: false,
                    error: `User not in required group: ${requiredGroup}`
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
                var argon2Hash = hashString.substring(8);
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
                if (searchEntries && searchEntries.length > 0) {
                    var userEntry = searchEntries[0];
                    var userData = {
                        username: username,
                        uid: userEntry.uid,
                        email: userEntry.mail || '',
                        displayName: userEntry.displayName || username
                    };
                    return {
                        exists: true,
                        user: userData,
                        fromCache: false
                    };
                }
                return {
                    exists: false,
                    user: null
                };
            } catch (searchError) {
                LSE_Logger.error(`[Fennel-NG LDAP] User search error: ${searchError.message}`);
                return {
                    exists: false,
                    user: null,
                    error: searchError.message
                };
            }
        } catch (error) {
            LSE_Logger.error(`[Fennel-NG LDAP] Validation error: ${error.message}`);
            return {
                exists: false,
                user: null,
                error: error.message
            };
        }
    }
}
module.exports = LDAPIntegration;
