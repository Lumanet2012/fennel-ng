const config = require('../config').config;
const argon2 = require('argon2');
class argon2auth {
    static async hashpassword(plainpassword) {
        try {
            const hash = await argon2.hash(plainpassword, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16,
                timeCost: 3,
                parallelism: 1,
            });
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info('[Fennel-NG Argon2] Password hashed with Argon2');
            }
            return hash;
        } catch (error) {
            LSE_Logger.error('[Fennel-NG Argon2] Argon2 hashing failed:', error);
            throw error;
        }
    }
    static async verifypassword(plainpassword, hash) {
        try {
            const isvalid = await argon2.verify(hash, plainpassword);
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info(`[Fennel-NG Argon2] Argon2 verification: ${isvalid ? 'SUCCESS' : 'FAILED'}`);
            }
            return isvalid;
        } catch (error) {
            LSE_Logger.error('[Fennel-NG Argon2] Argon2 verification failed:', error);
            return false;
        }
    }
    static isargon2hash(hash) {
        return hash && hash.startsWith('$argon2');
    }
    static async migratemd5toargon2(plainpassword) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.warn('[Fennel-NG Argon2] Migrating MD5 to Argon2 - this should only happen during migration');
        }
        return await this.hashpassword(plainpassword);
    }
}
module.exports = argon2auth;

