const redis = require('./redis');
const config = require('../config').config;
class ldapintegration {
    constructor(config) {
        this.config = config;
        this.ldapclient = null;
    }
    async initializeclient() {
        if(this.ldapclient) {
            return this.ldapclient;
        }
        try {
            const { Client } = require('ldapts');
            this.ldapclient = new Client({
                url: this.config.auth_method_ldap_url,
                timeout: 5000,
                connectTimeout: 10000,
                idleTimeout: 30000
            });
            return this.ldapclient;
        } catch(error) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`[Fennel-NG LDAP] Failed to initialize LDAP client: ${error.message}`);
            }
            throw error;
        }
    }
    async testconnection() {
        try {
            const client = await this.initializeclient();
            const testdn = this.config.auth_method_ldap_user_base_dn;
            const searchoptions = {
                scope: 'base',
                attributes: ['dn']
            };
            try {
                const { searchEntries } = await client.search(testdn, searchoptions);
                return {
                    success: searchEntries.length > 0,
                    error: searchEntries.length > 0 ? null : 'No entries found'
                };
            } catch(searcherror) {
                return {
                    success: false,
                    error: searcherror.message
                };
            }
        } catch(error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    async authenticateuser(username, password) {
        try {
            const cacheduser = await redis.getldapuser(username);
            if(cacheduser) {
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Using cached user data for: ${username}`);
                }
                const passwordvalid = await this.verifypassword(password, cacheduser.passwordHash);
                if(passwordvalid) {
                    return {
                        success: true,
                        user: cacheduser,
                        groups: cacheduser.groups || [],
                        fromCache: true
                    };
                }
            }
            const client = await this.initializeclient();
            if(this.config.auth_method_ldap_admin_dn && this.config.auth_method_ldap_admin_password) {
                await client.bind(this.config.auth_method_ldap_admin_dn, this.config.auth_method_ldap_admin_password);
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Admin service account bind successful`);
                }
            }
            const userbasedn = this.config.auth_method_ldap_user_base_dn;
            const requiredgroup = this.config.auth_method_ldap_required_group;
            const searchfilter = `(uid=${username})`;
            const searchoptions = {
                scope: 'sub',
                filter: searchfilter,
                attributes: ['uid', 'cn', 'memberOf', 'mail', 'displayName', 'userPassword']
            };
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Searching for user: ${username} in ${userbasedn}`);
            }
            const { searchEntries } = await client.search(userbasedn, searchoptions);
            if(searchEntries.length === 0) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG LDAP] User not found: ${username}`);
                }
                return {
                    success: false,
                    error: 'User not found'
                };
            }
            const userentry = searchEntries[0];
            const userdn = userentry.dn;
            const useruid = userentry.uid;
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Found user: ${username} with UID: ${useruid} at DN: ${userdn}`);
            }
            const groupbasedn = this.config.auth_method_ldap_group_base_dn;
            const groupfilter = `(&(cn=${requiredgroup})(member=${userdn}))`;
            const groupoptions = {
                scope: 'sub',
                filter: groupfilter,
                attributes: ['cn']
            };
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Checking group membership: ${groupfilter}`);
            }
            const { searchEntries: groupentries } = await client.search(groupbasedn, groupoptions);
            const hascaldavaccess = groupentries.length > 0;
            if(!hascaldavaccess) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG LDAP] User ${username} not found in required group: ${requiredgroup}`);
                }
                return {
                    success: false,
                    error: `User not authorized for CalDAV access - missing group: ${requiredgroup}`
                };
            }
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] User ${username} confirmed in group: ${requiredgroup}`);
            }
            const ldappasswordhash = userentry.userPassword;
            const passwordvalid = await this.verifypassword(password, ldappasswordhash);
            if(!passwordvalid) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG LDAP] Password verification failed for ${username}`);
                }
                return {
                    success: false,
                    error: 'Invalid password'
                };
            }
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info(`[Fennel-NG LDAP] Authentication successful for: ${username} (${useruid})`);
            }
            const userdata = {
                username: username,
                uid: useruid,
                email: userentry.mail || '',
                displayName: userentry.displayName || username,
                passwordHash: ldappasswordhash,
                groups: [{ cn: requiredgroup }],
                lastAuthenticated: Math.floor(Date.now() / 1000)
            };
            await redis.cacheldapuser(username, userdata, 300);
            return {
                success: true,
                user: userdata,
                groups: [{ cn: requiredgroup }]
            };
        } catch(error) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`[Fennel-NG LDAP] Authentication error: ${error.message}`);
            }
            return {
                success: false,
                error: error.message
            };
        }
    }
    async verifypassword(password, storedhash) {
        try {
            if(!storedhash) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG LDAP] No password hash provided for verification`);
                }
                return false;
            }
            const hashstring = Buffer.isBuffer(storedhash) ? storedhash.toString() :
                            Array.isArray(storedhash) ? storedhash[0].toString() :
                            storedhash.toString();
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Password hash type: ${typeof storedhash}, value: ${hashstring}`);
            }
            if(hashstring.startsWith('{ARGON2}')) {
                const argon2hash = hashstring.substring(8).replace(/\\\$/g, '$');
                const argon2auth = require('./argon2-auth');
                const result = await argon2auth.verifypassword(password, argon2hash);
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Argon2 verification result: ${result}`);
                }
                return result;
            } else {
                const result = (hashstring === password);
                if(config.LSE_Loglevel >= 2) {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Cleartext verification result: ${result}`);
                }
                return result;
            }
        } catch(error) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`[Fennel-NG LDAP] Password verification error: ${error.message}`);
            }
            return false;
        }
    }
    async getusergroups(username) {
        const client = await this.initializeclient();
        const groupbasedn = this.config.auth_method_ldap_group_base_dn;
        const searchfilter = `(member=cn=${username},${this.config.auth_method_ldap_user_base_dn})`;
        const searchoptions = {
            scope: 'sub',
            filter: searchfilter,
            attributes: ['cn', 'description']
        };
        try {
            const { searchEntries } = await client.search(groupbasedn, searchoptions);
            const groups = searchEntries.map(entry => ({
                cn: entry.cn,
                description: entry.description || ''
            }));
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug(`[Fennel-NG LDAP] Found ${groups.length} groups for user: ${username}`);
                groups.forEach(group => {
                    LSE_Logger.debug(`[Fennel-NG LDAP] Found group for ${username}: ${group.cn}`);
                });
            }
            return groups;
        } catch(error) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`[Fennel-NG LDAP] Group search error: ${error.message}`);
            }
            throw error;
        }
    }
    async validateuserexists(username) {
        try {
            const cacheduser = await redis.getldapuser(username);
            if(cacheduser) {
                return {
                    exists: true,
                    user: cacheduser,
                    fromCache: true
                };
            }
            const client = await this.initializeclient();
            const userbasedn = this.config.auth_method_ldap_user_base_dn;
            const searchfilter = `(uid=${username})`;
            const searchoptions = {
                scope: 'sub',
                filter: searchfilter,
                attributes: ['uid', 'cn', 'mail', 'displayName']
            };
            try {
                const { searchEntries } = await client.search(userbasedn, searchoptions);
                if(searchEntries.length > 0) {
                    const entry = searchEntries[0];
                    const userdata = {
                        username: entry.uid,
                        email: entry.mail || '',
                        displayName: entry.displayName || entry.cn
                    };
                    return {
                        exists: true,
                        user: userdata
                    };
                } else {
                    return {
                        exists: false,
                        user: null
                    };
                }
            } catch(searcherror) {
                return {
                    exists: false,
                    error: searcherror.message
                };
            }
        } catch(error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }
    async disconnect() {
        if(this.ldapclient) {
            try {
                await this.ldapclient.unbind();
            } catch(error) {
                if(config.LSE_Loglevel >= 1) {
                    LSE_Logger.warn(`[Fennel-NG LDAP] Error during disconnect: ${error.message}`);
                }
            }
            this.ldapclient = null;
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug('[Fennel-NG LDAP] Disconnected from LDAP server');
            }
        }
    }
}
module.exports = ldapintegration;

