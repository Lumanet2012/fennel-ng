/*-----------------------------------------------------------------------------
 **
 ** - Fennel-NG Argon2 Authentication -
 **
 ** Enhanced authentication with Argon2 password hashing
 ** Replaces insecure MD5 with modern Argon2 standard
 **
 -----------------------------------------------------------------------------*/

const argon2 = require('argon2');

class Argon2Auth {
    /**
     * Hash password with Argon2
     */
    static async hashPassword(plainPassword) {
        try {
            const hash = await argon2.hash(plainPassword, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16, // 64 MB
                timeCost: 3,         // 3 iterations
                parallelism: 1,      // 1 thread
            });
            LSE_Logger.info('Password hashed with Argon2');
            return hash;
        } catch (error) {
            LSE_Logger.error('Argon2 hashing failed:', error);
            throw error;
        }
    }

    /**
     * Verify password against Argon2 hash
     */
    static async verifyPassword(plainPassword, hash) {
        try {
            const isValid = await argon2.verify(hash, plainPassword);
            LSE_Logger.info(`Argon2 verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);
            return isValid;
        } catch (error) {
            LSE_Logger.error('Argon2 verification failed:', error);
            return false;
        }
    }

    /**
     * Check if hash is Argon2 format
     */
    static isArgon2Hash(hash) {
        return hash && hash.startsWith('$argon2');
    }

    /**
     * Migrate MD5 to Argon2 (for database migration)
     */
    static async migrateMD5ToArgon2(plainPassword) {
        LSE_Logger.warn('Migrating MD5 to Argon2 - this should only happen during migration');
        return await this.hashPassword(plainPassword);
    }
}
module.exports = Argon2Auth;
