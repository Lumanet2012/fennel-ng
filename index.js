/**
 * Fennel-NG Module Entry Point
 * Usage: const fennelNG = require('fennel-ng');
 */

const FennelNGServer = require('./fennel-ng');

// Export the main server class/function
module.exports = FennelNGServer;

// Also export individual components if needed
module.exports.FennelNGServer = FennelNGServer;
module.exports.createServer = function(config) {
    return new FennelNGServer(config);
};
