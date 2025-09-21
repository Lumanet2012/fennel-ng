/*-----------------------------------------------------------------------------
 **
 ** - Fennel Card-/CalDAV -
 **
 ** Copyright 2025 by
 ** LSE Group  https://lumanet.info
 ** and contributing authors
 **
 ** This program is free software; you can redistribute it and/or modify it
 ** under the terms of the GNU Affero General Public License as published by the
 ** Free Software Foundation, either version 3 of the License, or (at your
 ** option) any later version.
 **
 ** This program is distributed in the hope that it will be useful, but WITHOUT
 ** ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 ** FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for
 ** more details.
 **
 ** You should have received a copy of the GNU Affero General Public License
 ** along with this program. If not, see <http://www.gnu.org/licenses/>.
 **
 **-----------------------------------------------------------------------------
 **
 ** Original Authors:
 ** obecker@lumanet.info
 **
 ** $Id:
 **
 -----------------------------------------------------------------------------*/

// Place all your configuration options here

var mysql = require('mysql2/promise');
var config =
{
    version_nr: '0.1.0',
    // Public route prefix for API endpoints
    public_route_prefix: '/api/fennel-ng',
    port: 8888,
    ip: '10.0.0.11',
    db_name: 'lse_cal',
    db_uid: 'LSE-Admin',
    db_pwd: 'LSE-@dm1n',
    db_host: 'localhost',
    db_port: 3306,
    db_dialect: 'mysql',
    db_logging: true,
    db_connection_limit: 10,
    db_queue_limit: 0,
    db_enable_keepalive: true,
    db_keepalive_initial_delay: 0,
    jwt_secret: 'Orlando@6800882-orlando@5204502',
    jwt_cookie_name: 'LSE_token',
    jwt_expiry_minutes: 30,
    jwt_auto_renewal: true,
    redis_host: '10.0.0.11',
    redis_port: 6379,
    redis_password: 'Orlando@6800882',
    redis_db: 0,
    redis_key_prefix: 'fennel:',
    redis_connection_timeout: 5000,
    redis_command_timeout: 3000,
    auth_method: 'ldap',
    auth_method_courier_socket: '/var/run/courier/authdaemon/socket',
    auth_method_htaccess_file: 'demouser.htaccess',
    // LDAP Setup
    auth_method_ldap_url: 'ldaps://atl-web01.lumanet.info:636',
    // LDAP Service Account for reading userPassword attributes
    auth_method_ldap_admin_dn: 'cn=admin,dc=lumanet,dc=info',
    auth_method_ldap_admin_password: 'Orlando@5204502',
    auth_method_ldap_user_base_dn: 'ou=people,dc=lumanet,dc=info',
    auth_method_ldap_group_base_dn: 'ou=groups,dc=lumanet,dc=info',
    auth_method_ldap_service_dn: 'cn=fennelng-service,ou=service-accounts,dc=lumanet,dc=info',
    auth_method_ldap_service_password: process.env.LDAP_SERVICE_PASSWORD,
    auth_method_ldap_required_group: 'caldav-users',
    auth_cache_ttl: 300,
    authorisation: [
        'cal:$username:*',
        'card:$username:*',
        'p:options,report,propfind',
        'p:$username:*'
    ],
    test_user_name: 'demo',
    test_user_pwd: 'demo'
};
var fennelNGPool;
if(global.lse_cal_pool)
{
    fennelNGPool = global.lse_cal_pool;
    console.log('[Fennel-NG DB] Using existing MySQL Pool');
}
else
{
    fennelNGPool = mysql.createPool({
        host: config.db_host,
        port: config.db_port,
        user: config.db_uid,
        password: config.db_pwd,
        database: config.db_name,
        waitForConnections: true,
        connectionLimit: config.db_connection_limit,
        queueLimit: config.db_queue_limit,
        enableKeepAlive: config.db_enable_keepalive,
        keepAliveInitialDelay: config.db_keepalive_initial_delay
    });
    console.log('[Fennel-NG DB] Created MySQL Pool');
}
module.exports = {
    config: config,
    fennelNGPool: fennelNGPool
};



