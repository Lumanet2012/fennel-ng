# Fennel-NG (Next Generation)

**Modern CalDAV/CardDAV server built on Node.js with advanced authentication**

Fennel-NG is the next generation evolution of the original Fennel CalDAV server, enhanced with:

- 🔐 **Modern SSO Integration** - JWT token authentication with cookie support
- 🏢 **Enterprise LDAP** - Advanced LDAP integration with group-based access control
- 🔄 **Hybrid Authentication** - Multiple auth methods with intelligent fallback
- 🗄️ **Production Database** - MySQL/MariaDB support with Sabre.io compatibility
- ⚡ **High Performance** - Optimized for production workloads
- 🛡️ **Security First** - Argon2 password hashing and secure defaults

## Key Features

### Authentication Methods
- **JWT SSO** - Integration with existing Single Sign-On systems
- **LDAP Groups** - Group-based access control (e.g., `baikal-users`)
- **Password Fallback** - Direct LDAP authentication with Argon2 support
- **Cookie Support** - Seamless web browser integration

### Production Ready
- MySQL/MariaDB database backend
- Comprehensive logging via Winston syslog (LSE_logger)  and monitoring
- Health check endpoints
- Docker support
- Nginx reverse proxy integration

