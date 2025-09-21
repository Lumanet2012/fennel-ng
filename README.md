# Fennel-NG (Next Generation)

**Modern CalDAV/CardDAV server built on Node.js with advanced authentication**

Fennel-NG is the next generation evolution of the original Fennel CalDAV server, enhanced with:

- 🔐 **Modern SSO Integration** - JWT token authentication with cookie support
- 🏢 **Enterprise LDAP** - Advanced LDAP integration with group-based access control
- 🔄 **Hybrid Authentication** - Multiple auth methods with intelligent fallback
- 🗄️ **Production Database** - MySQL/MariaDB support with Sabre.io compatibility
- ⚡ **High Performance** - Optimized for production workloads with Redis clustering
- 🛡️ **Security First** - Argon2 password hashing and secure defaults

## Key Features

### Authentication Methods
- **JWT SSO** - Integration with existing Single Sign-On systems
- **LDAP Groups** - Group-based access control (e.g., `caldav-users`)
- **Password Fallback** - Direct LDAP authentication with Argon2 support
- **Cookie Support** - Seamless web browser integration via `LSE_token` cookie
- **Basic Auth** - Traditional username/password for CalDAV clients

### Production Ready
- **MySQL/MariaDB** - Sabre.io compatible database schema
- **Redis Clustering** - Distributed sync tokens for horizontal scaling
- **LSE_Logger Integration** - Comprehensive logging via Winston syslog
- **Health Check Endpoints** - System monitoring and diagnostics
- **Express Middleware** - Seamless integration with existing Node.js apps
- **Session Management** - Redis-backed user sessions

### CalDAV/CardDAV Protocol Support
- **Full RFC Compliance** - Complete CalDAV (RFC 4791) and CardDAV (RFC 6352) support
- **WebDAV Extensions** - PROPFIND, PROPPATCH, REPORT, MKCALENDAR methods
- **Sync Collections** - Efficient synchronization with sync tokens
- **Multi-get Operations** - Bulk calendar/contact retrieval
- **Auto-discovery** - `.well-known/caldav` and `.well-known/carddav` endpoints

## Requirements

- **Node.js** >= 16.0.0
- **MySQL/MariaDB** - Production database
- **Redis** - Clustering and session storage
- **OpenLDAP** - User authentication (optional)
- **LSE_Logger** - Global Winston NodeJS modified syslogger

## Installation

```bash
# Clone the repository
git clone https://github.com/Lumanet2012/fennel-ng.git
cd fennel-ng

# Install dependencies
npm install

# Install global logger (if not already installed)
npm install -g LSE_Logger
```

## Configuration

### 1. Database Configuration (config.js)

```javascript
var config = {
    // MySQL Database
    db_name: 'lse_cal',
    db_uid: 'LSE-Admin', 
    db_pwd: 'LSE-@dm1n',
    db_host: 'localhost',
    db_port: 3306,
    db_dialect: 'mysql',
    
    // Redis Configuration
    redis_host: '127.0.0.1',
    redis_port: 6379,
    redis_password: 'FennelNG_Redis_2025_Production_Key',
    redis_db: 0,
    
    // LDAP Authentication
    auth_method: 'ldap_jwt',
    auth_method_ldap_url: 'ldap://localhost:389',
    auth_method_ldap_user_base_dn: 'ou=users,dc=lumanet,dc=info',
    auth_method_ldap_group_base_dn: 'ou=groups,dc=lumanet,dc=info',
    auth_method_ldap_required_group: 'caldav-users',
    
    // JWT Configuration
    jwt_secret: 'your-jwt-secret-key-here',
    jwt_cookie_name: 'LSE_token',
    jwt_expiry_minutes: 30,
    jwt_auto_renewal: true
};
```

### 2. MySQL Database Setup

```sql
-- Create database and user
mysql -u root -p
CREATE DATABASE lse_cal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'LSE-Admin'@'localhost' IDENTIFIED BY 'LSE-@dm1n';
GRANT ALL PRIVILEGES ON lse_cal.* TO 'LSE-Admin'@'localhost';
FLUSH PRIVILEGES;
EXIT;

-- Import Fennel-NG schema
mysql -u LSE-Admin -p lse_cal < sql/fennel-mysql.sql

-- Verify installation
mysql -u LSE-Admin -p lse_cal -e "SHOW TABLES;"
```

### 3. Redis Configuration

```bash
# /etc/redis/redis.conf
requirepass FennelNG_Redis_2025_Production_Key
bind 127.0.0.1
port 6379
```

### 4. LDAP Group Setup

```ldif
# Create caldav-users group
dn: cn=caldav-users,ou=groups,dc=lumanet,dc=info
objectClass: groupOfNames
cn: caldav-users
description: Users with CalDAV/CardDAV access
member: cn=username,ou=users,dc=lumanet,dc=info
```

## Integration

### Option 1: Express Middleware (Recommended)

```javascript
// In your main server.js running on port 3000
const express = require('express');
const fennelNG = require('./fennel-ng');
const app = express();

// Initialize Fennel-NG
fennelNG.initialize().then(() => {
    console.log('Fennel-NG initialized successfully');
    
    // Your existing routes
    app.get('/', (req, res) => {
        res.send('Your main app');
    });
    
    // Add CalDAV/CardDAV middleware
    app.use(fennelNG.middleware());
    
    app.listen(3000);
}).catch(console.error);
```

### Option 2: Standalone Server

```javascript
const fennelNG = require('./fennel-ng');
const http = require('http');

fennelNG.initialize().then(() => {
    const server = http.createServer(fennelNG.handleRequest);
    server.listen(8888, '127.0.0.1');
    console.log('Fennel-NG CalDAV/CardDAV server running on port 8888');
}).catch(console.error);
```

## API Endpoints

### CalDAV Endpoints
- `GET /` - Redirects to principal discovery
- `PROPFIND /p/{username}/` - User principal discovery
- `PROPFIND /cal/{username}/` - Calendar collection discovery
- `MKCALENDAR /cal/{username}/{calendar}/` - Create calendar
- `PUT /cal/{username}/{calendar}/{event}.ics` - Create/update event
- `GET /cal/{username}/{calendar}/{event}.ics` - Retrieve event
- `DELETE /cal/{username}/{calendar}/{event}.ics` - Delete event
- `REPORT /cal/{username}/{calendar}/` - Calendar queries and sync

### CardDAV Endpoints
- `PROPFIND /card/{username}/` - Addressbook collection discovery
- `PUT /card/{username}/{addressbook}/{contact}.vcf` - Create/update contact
- `GET /card/{username}/{addressbook}/{contact}.vcf` - Retrieve contact
- `DELETE /card/{username}/{addressbook}/{contact}.vcf` - Delete contact
- `REPORT /card/{username}/{addressbook}/` - Addressbook queries and sync

### Auto-discovery
- `GET /.well-known/caldav` - CalDAV service discovery
- `GET /.well-known/carddav` - CardDAV service discovery

### Health Check
```javascript
// Check system health
const health = await fennelNG.healthCheck();
console.log(health);
```

## Authentication

### JWT Token Authentication
```javascript
// Set JWT token in cookie
res.cookie('LSE_token', jwtToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
});

// Or use Authorization header
headers: {
    'Authorization': 'Bearer ' + jwtToken
}
```

### Basic Authentication
```javascript
// Standard Basic Auth
headers: {
    'Authorization': 'Basic ' + base64(username + ':' + password)
}
```

## Client Configuration

### iOS/macOS
- **Server:** `https://your-domain.com/`
- **Username:** LDAP username
- **Password:** LDAP password or leave blank for SSO

### Thunderbird
- **CalDAV URL:** `https://your-domain.com/cal/username/`
- **CardDAV URL:** `https://your-domain.com/card/username/`

### Evolution/GNOME
- **Calendar URL:** `https://your-domain.com/cal/username/calendar-name/`
- **Contacts URL:** `https://your-domain.com/card/username/default/`

## Clustering

Fennel-NG supports horizontal scaling with Redis:

```javascript
// Node 1, 2, 3, etc. all share the same Redis instance
const config = {
    redis_host: 'redis-cluster.internal',
    redis_port: 6379
};

// Sync tokens are automatically distributed across all nodes
// Sessions are shared across the cluster
// LDAP authentication is cached and shared
```

## Monitoring

### Health Check Endpoint
```bash
curl http://localhost:3000/fennel-ng/health
```

### Logs
```bash
# LSE_Logger integration
tail -f /var/log/syslog | grep "Fennel-NG"
```

### Redis Monitoring
```bash
# Check sync tokens
redis-cli KEYS "caldav:*"
redis-cli KEYS "carddav:*"

# Check sessions
redis-cli KEYS "session:*"

# Check JWT cache
redis-cli KEYS "jwt:*"
```

## Performance

### Benchmarks
- **Single Node:** 1000+ concurrent CalDAV connections
- **Clustered:** Linear scaling with Redis backend
- **Memory Usage:** ~50MB per Node.js process
- **Database:** Optimized for Sabre.io schema with indexes

### Optimization Tips
1. **Enable Redis persistence** for production
2. **Use connection pooling** for MySQL
3. **Configure LDAP caching** (5-minute TTL)
4. **Enable gzip compression** in reverse proxy
5. **Use CDN** for static assets

## Security

### Best Practices
- **HTTPS Only** - Never run CalDAV/CardDAV over HTTP
- **Strong JWT Secrets** - Use 256-bit random keys
- **LDAP Group Control** - Restrict access via `caldav-users` group
- **Redis Security** - Use authentication and private networks
- **Regular Updates** - Keep dependencies current

### Firewall Configuration
```bash
# Only allow internal Redis access
iptables -A INPUT -p tcp --dport 6379 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 6379 -j DROP

# MySQL internal access only
iptables -A INPUT -p tcp --dport 3306 -s 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --dport 3306 -j DROP
```

## Troubleshooting

### Common Issues

**Connection Refused**
```bash
# Check if services are running
systemctl status redis-server
systemctl status mysql
systemctl status slapd
```

**Authentication Failures**
```bash
# Test LDAP connection
ldapsearch -x -H ldap://localhost -b "ou=users,dc=lumanet,dc=info"

# Check Redis connection
redis-cli ping

# Verify JWT secret
node -e "console.log(require('./config').config.jwt_secret)"
```

**Sync Issues**
```bash
# Clear Redis sync tokens
redis-cli FLUSHDB

# Check database connectivity
mysql -u LSE-Admin -p lse_cal -e "SELECT COUNT(*) FROM calendars;"
```

### Debug Mode
```javascript
// Enable debug logging
const config = {
    db_logging: true,
    // ... other config
};
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

GNU Affero General Public License v3.0

## Support

- **Issues:** https://github.com/Lumanet2012/fennel-ng/issues
- **Documentation:** https://github.com/Lumanet2012/fennel-ng/wiki
- **Email:** support@lumanet.info

## Changelog

### v2.0.0 (2025)
- Complete rewrite for production use
- Redis clustering support
- JWT authentication integration
- MySQL/MariaDB backend
- LDAP group-based access control
- Express middleware support
- Comprehensive logging
- Health monitoring
- Session management

### v1.x (Original Fennel)
- Basic CalDAV/CardDAV server
- SQLite database
- HTTP Basic authentication
- Single-node deployment
