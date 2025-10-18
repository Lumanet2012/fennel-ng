var config = require('../config').config;
var pool = require('../config').fennelNGPool;
var Sequelize = require('sequelize');
var sequelize = new Sequelize(config.db_name, config.db_uid, config.db_pwd, {
    host: config.db_host || 'localhost',
    port: config.db_port || 3306,
    dialect: 'mysql',
    logging: function(info) {
        if(config.db_logging) {
            LSE_Logger.debug(`[Fennel-NG DB] ${info}`);
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
var principals = sequelize.define('principals', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false, unique: true },
    email: { type: Sequelize.STRING(80), allowNull: true },
    displayname: { type: Sequelize.STRING(80), allowNull: true }
}, {
    tableName: 'principals',
    timestamps: false
});
var users = sequelize.define('users', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    username: { type: Sequelize.STRING(50), allowNull: true, unique: true },
    digesta1: { type: Sequelize.STRING(32), allowNull: true }
}, {
    tableName: 'users',
    timestamps: false
});
var calendars = sequelize.define('calendars', {
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
var calendarobjects = sequelize.define('calendarobjects', {
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
var calendarchanges = sequelize.define('calendarchanges', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    calendarid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: Sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'calendarchanges',
    timestamps: false
});
var addressbooks = sequelize.define('addressbooks', {
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
var vcards = sequelize.define('cards', {
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
var addressbookchanges = sequelize.define('addressbookchanges', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    uri: { type: Sequelize.STRING(200), allowNull: false },
    synctoken: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    addressbookid: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
    operation: { type: Sequelize.TINYINT(1), allowNull: false }
}, {
    tableName: 'addressbookchanges',
    timestamps: false
});
var locks = sequelize.define('locks', {
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
var propertystorage = sequelize.define('propertystorage', {
    id: { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    path: { type: Sequelize.STRING(1024), allowNull: false },
    name: { type: Sequelize.STRING(100), allowNull: false },
    valuetype: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    value: { type: Sequelize.BLOB('medium'), allowNull: true }
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
const principalswrapper={
    findone:(options)=>principals.findOne(options),
    findall:(options)=>principals.findAll(options),
    create:(data)=>principals.create(data),
    update:(data,options)=>principals.update(data,options),
    destroy:(options)=>principals.destroy(options)
};
const userswrapper={
    findone:(options)=>users.findOne(options),
    findall:(options)=>users.findAll(options),
    create:(data)=>users.create(data),
    update:(data,options)=>users.update(data,options),
    destroy:(options)=>users.destroy(options)
};
const calendarswrapper={
    findone:(options)=>calendars.findOne(options),
    findall:(options)=>calendars.findAll(options),
    create:(data)=>calendars.create(data),
    update:(data,options)=>calendars.update(data,options),
    destroy:(options)=>calendars.destroy(options)
};
const calendarobjectswrapper={
    findone:(options)=>calendarobjects.findOne(options),
    findall:(options)=>calendarobjects.findAll(options),
    create:(data)=>calendarobjects.create(data),
    update:(data,options)=>calendarobjects.update(data,options),
    destroy:(options)=>calendarobjects.destroy(options)
};
const calendarchangeswrapper={
    findone:(options)=>calendarchanges.findOne(options),
    findall:(options)=>calendarchanges.findAll(options),
    create:(data)=>calendarchanges.create(data),
    update:(data,options)=>calendarchanges.update(data,options),
    destroy:(options)=>calendarchanges.destroy(options)
};
const addressbookswrapper={
    findone:(options)=>addressbooks.findOne(options),
    findall:(options)=>addressbooks.findAll(options),
    create:(data)=>addressbooks.create(data),
    update:(data,options)=>addressbooks.update(data,options),
    destroy:(options)=>addressbooks.destroy(options)
};
const vcardswrapper={
    findone:(options)=>vcards.findOne(options),
    findall:(options)=>vcards.findAll(options),
    create:(data)=>vcards.create(data),
    update:(data,options)=>vcards.update(data,options),
    destroy:(options)=>vcards.destroy(options)
};
const addressbookchangeswrapper={
    findone:(options)=>addressbookchanges.findOne(options),
    findall:(options)=>addressbookchanges.findAll(options),
    create:(data)=>addressbookchanges.create(data),
    update:(data,options)=>addressbookchanges.update(data,options),
    destroy:(options)=>addressbookchanges.destroy(options)
};
const lockswrapper={
    findone:(options)=>locks.findOne(options),
    findall:(options)=>locks.findAll(options),
    create:(data)=>locks.create(data),
    update:(data,options)=>locks.update(data,options),
    destroy:(options)=>locks.destroy(options)
};
const propertystoragewrapper={
    findone:(options)=>propertystorage.findOne(options),
    findall:(options)=>propertystorage.findAll(options),
    create:(data)=>propertystorage.create(data),
    update:(data,options)=>propertystorage.update(data,options),
    destroy:(options)=>propertystorage.destroy(options)
};
async function testdatabaseconnection() {
    try {
        await sequelize.authenticate();
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG DB] MySQL connection established successfully');
        }
        return true;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Unable to connect to MySQL: ${error.message}`);
        return false;
    }
}
async function syncdatabase() {
    try {
        await sequelize.sync({ alter: false });
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info('[Fennel-NG DB] Database synchronized successfully');
        }
        return true;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Database synchronization failed: ${error.message}`);
        return false;
    }
}
async function executerawquery(query, params) {
    try {
        var [results, metadata] = await sequelize.query(query, {
            replacements: params || [],
            type: Sequelize.QueryTypes.SELECT
        });
        return results;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Raw query failed: ${error.message}`);
        throw error;
    }
}
async function executerawupdate(query, params) {
    try {
        var [results, metadata] = await sequelize.query(query, {
            replacements: params || [],
            type: Sequelize.QueryTypes.UPDATE
        });
        return metadata;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Raw update failed: ${error.message}`);
        throw error;
    }
}
async function getuserprincipal(username) {
    try {
        var principal = await principals.findOne({
            where: { uri: `principals/${username}` }
        });
        return principal;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Error getting user principal: ${error.message}`);
        return null;
    }
}
async function createuserprincipal(username, email, displayname) {
    try {
        var principal = await principals.create({
            uri: `principals/${username}`,
            email: email || null,
            displayname: displayname || username
        });
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.info(`[Fennel-NG DB] Created principal for user: ${username}`);
        }
        return principal;
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG DB] Error creating user principal: ${error.message}`);
        return null;
    }
}
async function healthcheck() {
    try {
        var connectiontest = await testdatabaseconnection();
        var querytest = await executerawquery('SELECT 1 as test');
        return {
            status: 'ok',
            connected: connectiontest,
            queryWorking: querytest && querytest.length > 0,
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
    principals: principalswrapper,
    users: userswrapper,
    calendars: calendarswrapper,
    calendarobjects: calendarobjectswrapper,
    calendarchanges: calendarchangeswrapper,
    addressbooks: addressbookswrapper,
    vcards: vcardswrapper,
    addressbookchanges: addressbookchangeswrapper,
    locks: lockswrapper,
    propertystorage: propertystoragewrapper,
    sequelize: sequelize,
    pool: pool,
    testdatabaseconnection: testdatabaseconnection,
    syncdatabase: syncdatabase,
    executerawquery: executerawquery,
    executerawupdate: executerawupdate,
    getuserprincipal: getuserprincipal,
    createuserprincipal: createuserprincipal,
    healthcheck: healthcheck
};
