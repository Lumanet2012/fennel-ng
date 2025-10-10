const config = require('../config').config;
const pool = require('../config').fennelngpool;
const sequelize = require('sequelize');
const seq = new sequelize(config.db_name, config.db_uid, config.db_pwd, {
    host: config.db_host || 'localhost',
    port: config.db_port || 3306,
    dialect: 'mysql',
    logging: function(info) { 
        if(config.db_logging) {
            if(config.LSE_Loglevel >= 2) {
                LSE_Logger.debug('[Fennel-NG DB] ' + info);
            }
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
const principals = seq.define('principals', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: sequelize.STRING(200), allowNull: false, unique: true },
    email: { type: sequelize.STRING(80), allowNull: true },
    displayname: { type: sequelize.STRING(80), allowNull: true }
}, {
    tableName: 'principals',
    timestamps: false
});
const users = seq.define('users', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    username: { type: sequelize.STRING(50), allowNull: true, unique: true },
    digesta1: { type: sequelize.STRING(32), allowNull: true }
}, {
    tableName: 'users',
    timestamps: false
});
const calendars = seq.define('calendars', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    principaluri: { type: sequelize.STRING(255), allowNull: true },
    synctoken: { type: sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    components: { type: sequelize.STRING(21), allowNull: true },
    displayname: { type: sequelize.STRING(100), allowNull: true },
    uri: { type: sequelize.STRING(200), allowNull: false },
    description: { type: sequelize.TEXT, allowNull: true },
    calendarorder: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    calendarcolor: { type: sequelize.STRING(10), allowNull: true },
    timezone: { type: sequelize.TEXT, allowNull: true },
    transparent: { type: sequelize.BOOLEAN, allowNull: true },
    shared: { type: sequelize.BOOLEAN, allowNull: true }
}, {
    tableName: 'calendars',
    timestamps: false
});
const calendarobjects = seq.define('calendarobjects', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    calendardata: { type: sequelize.BLOB('medium'), allowNull: true },
    uri: { type: sequelize.STRING(200), allowNull: true },
    calendarid: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    lastmodified: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    etag: { type: sequelize.STRING(32), allowNull: true },
    size: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    componenttype: { type: sequelize.STRING(8), allowNull: true },
    firstoccurence: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    lastoccurence: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    uid: { type: sequelize.STRING(200), allowNull: true }
}, {
    tableName: 'calendarobjects',
    timestamps: false
});
const calendarchanges = seq.define('calendarchanges', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: sequelize.STRING(200), allowNull: false },
    synctoken: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    calendarid: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'calendarchanges',
    timestamps: false
});
const addressbooks = seq.define('addressbooks', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    principaluri: { type: sequelize.STRING(255), allowNull: true },
    displayname: { type: sequelize.STRING(255), allowNull: true },
    uri: { type: sequelize.STRING(200), allowNull: true },
    description: { type: sequelize.TEXT, allowNull: true },
    synctoken: { type: sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 }
}, {
    tableName: 'addressbooks',
    timestamps: false
});
const vcards = seq.define('cards', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    addressbookid: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    carddata: { type: sequelize.BLOB('medium'), allowNull: true },
    uri: { type: sequelize.STRING(200), allowNull: true },
    lastmodified: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    etag: { type: sequelize.STRING(32), allowNull: true },
    size: { type: sequelize.INTEGER.UNSIGNED, allowNull: false }
}, {
    tableName: 'cards',
    timestamps: false
});
const addressbookchanges = seq.define('addressbookchanges', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: sequelize.STRING(200), allowNull: false },
    synctoken: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    addressbookid: { type: sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'addressbookchanges',
    timestamps: false
});
const locks = seq.define('locks', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    owner: { type: sequelize.STRING(100), allowNull: true },
    timeout: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    created: { type: sequelize.INTEGER, allowNull: true },
    token: { type: sequelize.STRING(100), allowNull: true },
    scope: { type: sequelize.TINYINT(4), allowNull: true },
    depth: { type: sequelize.TINYINT(4), allowNull: true },
    uri: { type: sequelize.STRING(1000), allowNull: true }
}, {
    tableName: 'locks',
    timestamps: false
});
const propertystorage = seq.define('propertystorage', {
    id: { type: sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    path: { type: sequelize.STRING(1024), allowNull: false },
    name: { type: sequelize.STRING(100), allowNull: false },
    valuetype: { type: sequelize.INTEGER.UNSIGNED, allowNull: true },
    value: { type: sequelize.BLOB('medium'), allowNull: true }
}, {
    tableName: 'propertystorage',
    timestamps: false
});
calendarobjects.belongsTo(calendars, { foreignKey: 'calendarid', targetKey: 'id' });
calendars.hasMany(calendarobjects, { foreignKey: 'calendarid', sourceKey: 'id' });
calendarchanges.belongsTo(calendars, { foreignKey: 'calendarid', targetKey: 'id' });
calendars.hasMany(calendarchanges, { foreignKey: 'calendarid', sourceKey: 'id' });
vcards.belongsTo(addressbooks, { foreignKey: 'addressbookid', targetKey: 'id' });
addressbooks.hasMany(vcards, { foreignKey: 'addressbookid', sourceKey: 'id' });
addressbookchanges.belongsTo(addressbooks, { foreignKey: 'addressbookid', targetKey: 'id' });
addressbooks.hasMany(addressbookchanges, { foreignKey: 'addressbookid', sourceKey: 'id' });
async function testdatabaseconnection() {
    try {
        await seq.authenticate();
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG DB] MySQL connection established successfully');
        }
        return true;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Unable to connect to MySQL: ' + error.message);
        }
        return false;
    }
}
async function syncdatabase() {
    try {
        await seq.sync({ alter: false });
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG DB] Database synchronized successfully');
        }
        return true;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Database synchronization failed: ' + error.message);
        }
        return false;
    }
}
async function executerawquery(query, params) {
    try {
        const [results, metadata] = await seq.query(query, {
            replacements: params || [],
            type: sequelize.QueryTypes.SELECT
        });
        return results;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Raw query failed: ' + error.message);
        }
        throw error;
    }
}
async function executerawupdate(query, params) {
    try {
        const [results, metadata] = await seq.query(query, {
            replacements: params || [],
            type: sequelize.QueryTypes.UPDATE
        });
        return metadata;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Raw update failed: ' + error.message);
        }
        throw error;
    }
}
async function getuserprincipal(username) {
    try {
        const principal = await principals.findOne({
            where: { uri: 'principals/' + username }
        });
        return principal;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Error getting user principal: ' + error.message);
        }
        return null;
    }
}
async function createuserprincipal(username, email, displayname) {
    try {
        const principal = await principals.create({
            uri: 'principals/' + username,
            email: email || null,
            displayname: displayname || username
        });
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG DB] Created principal for user: ' + username);
        }
        return principal;
    } catch (error) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG DB] Error creating user principal: ' + error.message);
        }
        return null;
    }
}
async function healthcheck() {
    try {
        const connectiontest = await testdatabaseconnection();
        const querytest = await executerawquery('SELECT 1 as test');
        return {
            status: 'ok',
            connected: connectiontest,
            queryworking: querytest && querytest.length > 0,
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
    principals: principals,
    users: users,
    calendars: calendars,
    calendarobjects: calendarobjects,
    calendarchanges: calendarchanges,
    addressbooks: addressbooks,
    vcards: vcards,
    addressbookchanges: addressbookchanges,
    locks: locks,
    propertystorage: propertystorage,
    sequelize: seq,
    pool: pool,
    testdatabaseconnection: testdatabaseconnection,
    syncdatabase: syncdatabase,
    executerawquery: executerawquery,
    executerawupdate: executerawupdate,
    getuserprincipal: getuserprincipal,
    createuserprincipal: createuserprincipal,
    healthcheck: healthcheck
};

