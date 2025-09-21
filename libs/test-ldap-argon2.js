/*-----------------------------------------------------------------------------
 **
 ** - Fennel-NG LDAP + Argon2 Test -
 **
 -----------------------------------------------------------------------------*/

const LDAPIntegration = require('./ldap-integration');
const Argon2Auth = require('./argon2-auth');
const config = require('../config').config;
const LSE_logger = require('LSE_logger');

async function testIntegration() {
    LSE_logger.info('Testing Fennel-NG LDAP + Argon2 Integration');

    // Test 1: Argon2 Hashing
    LSE_logger.info('Testing Argon2 password hashing');
    try {
        const testPassword = 'testPassword123';
        const hash = await Argon2Auth.hashPassword(testPassword);
        LSE_logger.info(`Hash generated: ${hash.substring(0, 50)}...`);
        
        const isValid = await Argon2Auth.verifyPassword(testPassword, hash);
        LSE_logger.info(`Verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
        LSE_logger.error(`Argon2 test failed: ${error.message}`);
    }

    // Test 2: LDAP Connection
    LSE_logger.info('Testing LDAP connection');
    const ldapClient = new LDAPIntegration(config);
    
    try {
        const connectionResult = await ldapClient.testConnection();
        if (connectionResult.success) {
            LSE_logger.info('LDAP connection successful');
        } else {
            LSE_logger.error(`LDAP connection failed: ${connectionResult.error}`);
        }
    } catch (error) {
        LSE_logger.error(`LDAP connection error: ${error.message}`);
    }

    // Test 3: User Authentication
    LSE_logger.info('Testing user authentication');
    try {
        const authResult = await ldapClient.authenticateUser('testuser', 'testpass');
        if (authResult.success) {
            LSE_logger.info('User authentication successful');
            LSE_logger.info(`Groups: ${authResult.groups.map(g => g.cn).join(', ')}`);
        } else {
            LSE_logger.error(`User authentication failed: ${authResult.error}`);
        }
    } catch (error) {
        LSE_logger.error(`Authentication test error: ${error.message}`);
    }

    LSE_logger.info('Integration test completed');
}

// Run the test
testIntegration().catch(LSE_logger.error);
