const ldapintegration = require('./ldap-integration');
const argon2auth = require('./argon2-auth');
const config = require('../config').config;
async function testintegration() {
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('Testing Fennel-NG LDAP + Argon2 Integration');
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('Testing Argon2 password hashing');
    }
    try {
        const testpassword = 'testPassword123';
        const hash = await argon2auth.hashpassword(testpassword);
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info(`Hash generated: ${hash.substring(0, 50)}...`);
        }
        const isvalid = await argon2auth.verifypassword(testpassword, hash);
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info(`Verification: ${isvalid ? 'SUCCESS' : 'FAILED'}`);
        }
    } catch(error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error(`Argon2 test failed: ${error.message}`);
        }
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('Testing LDAP connection');
    }
    const ldapclient = new ldapintegration(config);
    try {
        const connectionresult = await ldapclient.testconnection();
        if(connectionresult.success) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info('LDAP connection successful');
            }
        } else {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`LDAP connection failed: ${connectionresult.error}`);
            }
        }
    } catch(error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error(`LDAP connection error: ${error.message}`);
        }
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('Testing user authentication');
    }
    try {
        const authresult = await ldapclient.authenticateuser('testuser', 'testpass');
        if(authresult.success) {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info('User authentication successful');
                LSE_Logger.info(`Groups: ${authresult.groups.map(g => g.cn).join(', ')}`);
            }
        } else {
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.error(`User authentication failed: ${authresult.error}`);
            }
        }
    } catch(error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error(`Authentication test error: ${error.message}`);
        }
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.info('Integration test completed');
    }
}
testintegration().catch(LSE_Logger.error);

