function createDebugMiddleware() {
    return function(req, res, next) {
        const originalUrl = req.originalUrl || req.url;
        const prefix = '/api/fennel-ng';
        if (!originalUrl.startsWith(prefix)) {
            return next();
        }
        const startTime = Date.now();
        LSE_Logger.info(`[FENNEL-NG RAW] ========== INCOMING REQUEST ${new Date().toISOString()} ==========`);
        LSE_Logger.info(`[FENNEL-NG RAW] Method: ${req.method}`);
        LSE_Logger.info(`[FENNEL-NG RAW] URL: ${originalUrl}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Query: ${JSON.stringify(req.query)}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Headers: ${JSON.stringify(req.headers, null, 2)}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Remote IP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
        LSE_Logger.info(`[FENNEL-NG RAW] HTTP Version: ${req.httpVersion}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Protocol: ${req.protocol}`);
        let rawBody = '';
        const originalRead = req.read;
        const originalOn = req.on;
        const chunks = [];
        req.on = function(event, handler) {
            if (event === 'data') {
                const wrappedHandler = function(chunk) {
                    rawBody += chunk.toString();
                    chunks.push(chunk);
                    LSE_Logger.info(`[FENNEL-NG RAW] DATA EVENT: Received ${chunk.length} bytes`);
                    LSE_Logger.info(`[FENNEL-NG RAW] DATA CONTENT: ${chunk.toString()}`);
                    return handler.call(this, chunk);
                };
                return originalOn.call(this, event, wrappedHandler);
            } else if (event === 'end') {
                const wrappedHandler = function() {
                    LSE_Logger.info(`[FENNEL-NG RAW] END EVENT: Total body length: ${rawBody.length}`);
                    LSE_Logger.info(`[FENNEL-NG RAW] COMPLETE REQUEST BODY: ${rawBody}`);
                    return handler.call(this);
                };
                return originalOn.call(this, event, wrappedHandler);
            } else {
                return originalOn.call(this, event, handler);
            }
        };
        let responseBody = '';
        const originalWrite = res.write;
        const originalEnd = res.end;
        const originalJson = res.json;
        const originalSend = res.send;
        res.write = function(chunk, encoding, callback) {
            if (chunk) {
                const chunkStr = chunk.toString();
                responseBody += chunkStr;
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE WRITE: ${chunkStr.length} bytes`);
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE CHUNK: ${chunkStr}`);
            }
            return originalWrite.call(this, chunk, encoding, callback);
        };
        res.end = function(chunk, encoding, callback) {
            if (chunk) {
                const chunkStr = chunk.toString();
                responseBody += chunkStr;
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE END: ${chunkStr.length} bytes`);
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE END CHUNK: ${chunkStr}`);
            }
            const endTime = Date.now();
            LSE_Logger.info(`[FENNEL-NG RAW] ========== OUTGOING RESPONSE ${new Date().toISOString()} ==========`);
            LSE_Logger.info(`[FENNEL-NG RAW] Status Code: ${res.statusCode}`);
            LSE_Logger.info(`[FENNEL-NG RAW] Status Message: ${res.statusMessage || 'OK'}`);
            LSE_Logger.info(`[FENNEL-NG RAW] Response Headers: ${JSON.stringify(res.getHeaders(), null, 2)}`);
// Force output the XML content regardless of size
if (responseBody.includes('<?xml')) {
    LSE_Logger.info(`[FENNEL-NG RAW] XML RESPONSE: ${responseBody}`);
} else {
    LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE CHUNK 1: ${responseBody.substring(0, 1000)}`);
}
LSE_Logger.info(`[FENNEL-NG RAW] Response Body Length: ${responseBody.length}`);
if (responseBody.length > 0) {
    const chunkSize = 1000;
    for (let i = 0; i < responseBody.length; i += chunkSize) {
        const chunk = responseBody.substring(i, i + chunkSize);
        LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE CHUNK ${Math.floor(i/chunkSize) + 1}: ${chunk}`);
    }
} else {
    LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE BODY: <empty>`);
}
            LSE_Logger.info(`[FENNEL-NG RAW] Request Duration: ${endTime - startTime}ms`);
            LSE_Logger.info(`[FENNEL-NG RAW] =======================================`);
            return originalEnd.call(this, chunk, encoding, callback);
        };
        res.json = function(obj) {
            const jsonStr = JSON.stringify(obj);
            LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE JSON: ${jsonStr}`);
            responseBody += jsonStr;
            return originalJson.call(this, obj);
        };
        res.send = function(body) {
            if (body) {
                const bodyStr = body.toString();
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE SEND: ${bodyStr}`);
                responseBody += bodyStr;
            }
            return originalSend.call(this, body);
        };
        res.on('finish', () => {
            LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE FINISHED: Status=${res.statusCode}, Total Body=${responseBody.length} bytes`);
        });

        res.on('close', () => {
            LSE_Logger.info(`[FENNEL-NG RAW] CONNECTION CLOSED: Status=${res.statusCode}`);
        });

        next();
    };
}
module.exports = createDebugMiddleware;
