var LSE_logger = require('LSE_logger');
var config = require('../config').config;
var pool = require('../config').fennelNGPool;
var Sequelize = require('sequelize');
var sequelize = new Sequelize(config.db_name, config.db_uid, config.db_pwd, {
    host: config.db_host || 'localhost',
    port: config.db_port || 3306,
    dialect: 'mysql',
    logging: function(info) { 
        if(config.db_logging) {
            LSE_logger.debug(`[Fennel-NG DB] ${info}`);
        }
    },
    pool: {
        max: config.db_connection_limit || 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true
    }
});
var PRINCIPALS = sequelize.define('principals', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false, unique: true },
    email: { type: Sequelize.STRING(80), allowNull: true },
    displayname: { type: Sequelize.STRING(80), allowNull: true }
}, {
    tableName: 'principals',
    timestamps: false
});
var USERS = sequelize.define('users', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    username: { type: Sequelize.STRING(50), allowNull: true, unique: true },
    digesta1: { type: Sequelize.STRING(32), allowNull: true }
}, {
    tableName: 'users',
    timestamps: false
});
var CALENDARS = sequelize.define('calendars', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    principaluri: { type: Sequelize.STRING(255), allowNull: true },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    components: { type: Sequelize.STRING(21), allowNull: true },
    displayname: { type: Sequelize.STRING(100), allowNull: true },
    uri: { type: Sequelize.STRING(200), allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: true },
    calendarorder: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    calendarcolor: { type: Sequelize.STRING(10), allowNull: true },
    timezone: { type: Sequelize.TEXT, allowNull: true },
    transparent: { type: Sequelize.BOOLEAN, allowNull: true },
    shared: { type: Sequelize.BOOLEAN, allowNull: true }
}, {
    tableName: 'calendars',
    timestamps: false
});
var CALENDAROBJECTS = sequelize.define('calendarobjects', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    calendardata: { type: Sequelize.BLOB('medium'), allowNull: true },
    uri: { type: Sequelize.STRING(200), allowNull: true },
    calendarid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    lastmodified: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    etag: { type: Sequelize.STRING(32), allowNull: true },
    size: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    componenttype: { type: Sequelize.STRING(8), allowNull: true },
    firstoccurence: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    lastoccurence: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    uid: { type: Sequelize.STRING(200), allowNull: true }
}, {
    tableName: 'calendarobjects',
    timestamps: false
});
var CALENDARCHANGES = sequelize.define('calendarchanges', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    calendarid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: Sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'calendarchanges',
    timestamps: false
});
var ADDRESSBOOKS = sequelize.define('addressbooks', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    principaluri: { type: Sequelize.STRING(255), allowNull: true },
    displayname: { type: Sequelize.STRING(255), allowNull: true },
    uri: { type: Sequelize.STRING(200), allowNull: true },
    description: { type: Sequelize.TEXT, allowNull: true },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 }
}, {
    tableName: 'addressbooks',
    timestamps: false
});
var VCARDS = sequelize.define('cards', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    addressbookid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    carddata: { type: Sequelize.BLOB('medium'), allowNull: true },
    uri: { type: Sequelize.STRING(200), allowNull: true },
    lastmodified: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    etag: { type: Sequelize.STRING(32), allowNull: true },
    size: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }
}, {
    tableName: 'cards',
    timestamps: false
});
var ADDRESSBOOKCHANGES = sequelize.define('addressbookchanges', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    addressbookid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: Sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'addressbookchanges',
    timestamps: false
});
var LOCKS = sequelize.define('locks', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    owner: { type: Sequelize.STRING(100), allowNull: true },
    timeout: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    created: { type: Sequelize.INTEGER, allowNull: true },
    token: { type: Sequelize.STRING(100), allowNull: true },
    scope: { type: Sequelize.TINYINT(4), allowNull: true },
    depth: { type: Sequelize.TINYINT(4), allowNull: true },
    uri: { type: Sequelize.STRING(1000), allowNull: true }
}, {
    tableName: 'locks',
    timestamps: false
});
var PROPERTYSTORAGE = sequelize.define('propertystorage', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    path: { type: Sequelize.STRING(1024), allowNull: false },
    name: { type: Sequelize.STRING(100), allowNull: false },
    valuetype: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    value: { type: Sequelize.BLOB('medium'), allowNull: true }
}, {
    tableName: 'propertystorage',
    timestamps: false
});
CALENDAROBJECTS.belongsTo(CALENDARS, { foreignKey: 'calendarid', targetKey: 'id' });
CALENDARS.hasMany(CALENDAROBJECTS, { foreignKey: 'calendarid', sourceKey: 'id' });
CALENDARCHANGES.belongsTo(CALENDARS, { foreignKey: 'calendarid', targetKey: 'id' });
CALENDARS.hasMany(CALENDARCHANGES, { foreignKey: 'calendarid', sourceKey: 'id' });
VCARDS.belongsTo(ADDRESSBOOKS, { foreignKey: 'addressbookid', targetKey: 'id' });
ADDRESSBOOKS.hasMany(VCARDS, { foreignKey: 'addressbookid', sourceKey: 'id' });
ADDRESSBOOKCHANGES.belongsTo(ADDRESSBOOKS, { foreignKey: 'addressbookid', targetKey: 'id' });
ADDRESSBOOKS.hasMany(ADDRESSBOOKCHANGES, { foreignKey: 'addressbookid', sourceKey: 'id' });
async function testDatabaseConnection() {
    try {
        await sequelize.authenticate();
        LSE_logger.info('[Fennel-NG DB] MySQL connection established successfully');
        return true;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Unable to connect to MySQL: ${error.message}`);
        return false;
    }
}
async function syncDatabase() {
    try {
        await sequelize.sync({ alter: false });
        LSE_logger.info('[Fennel-NG DB] Database synchronized successfully');
        return true;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Database synchronization failed: ${error.message}`);
        return false;
    }
}
async function executeRawQuery(query, params) {
    try {
        var [results, metadata] = await sequelize.query(query, {
            replacements: params || [],
            type: Sequelize.QueryTypes.SELECT
        });
        return results;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Raw query failed: ${error.message}`);
        throw error;
    }
}
async function executeRawUpdate(query, params) {
    try {
        var [results, metadata] = await sequelize.query(query, {
            replacements: params || [],
            type: Sequelize.QueryTypes.UPDATE
        });
        return metadata;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Raw update failed: ${error.message}`);
        throw error;
    }
}
async function getUserPrincipal(username) {
    try {
        var principal = await PRINCIPALS.findOne({
            where: { uri: `principals/${username}` }
        });
        return principal;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Error getting user principal: ${error.message}`);
        return null;
    }
}
async function createUserPrincipal(username, email, displayname) {
    try {
        var principal = await PRINCIPALS.create({
            uri: `principals/${username}`,
            email: email || null,
            displayname: displayname || username
        });
        LSE_logger.info(`[Fennel-NG DB] Created principal for user: ${username}`);
        return principal;
    } catch (error) {
        LSE_logger.error(`[Fennel-NG DB] Error creating user principal: ${error.message}`);
        return null;
    }
}
async function healthCheck() {
    try {
        var connectionTest = await testDatabaseConnection();
        var queryTest = await executeRawQuery('SELECT 1 as test');
        return {
            status: 'ok',
            connected: connectionTest,
            queryWorking: queryTest && queryTest.length > 0,
            database: config.db_name,
            host: config.db_host
        };
    } catch (error) {
        return {
            status: 'error',
            connected: false,
            error: error.message
        };
    }
}
module.exports = {
    PRINCIPALS: PRINCIPALS,
    USERS: USERS,
    CALENDARS: CALENDARS,
    CALENDAROBJECTS: CALENDAROBJECTS,
    CALENDARCHANGES: CALENDARCHANGES,
    ADDRESSBOOKS: ADDRESSBOOKS,
    VCARDS: VCARDS,
    ADDRESSBOOKCHANGES: ADDRESSBOOKCHANGES,
    LOCKS: LOCKS,
    PROPERTYSTORAGE: PROPERTYSTORAGE,
    sequelize: sequelize,
    pool: pool,
    testDatabaseConnection: testDatabaseConnection,
    syncDatabase: syncDatabase,
    executeRawQuery: executeRawQuery,
    executeRawUpdate: executeRawUpdate,
    getUserPrincipal: getUserPrincipal,
    createUserPrincipal: createUserPrincipal,
    healthCheck: healthCheck
};

