function createDebugMiddleware() {
    return function(req, res, next) {
        const originalUrl = req.originalUrl || req.url;
        const prefix = '/api/fennel-ng';
        if (!originalUrl.startsWith(prefix)) {
            return next();
        }
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substr(2, 9);
        
        function logLargeContent(prefix, content) {
            const syslogOverhead = 150;
            const maxPayloadSize = 1024 - syslogOverhead;
            const lines = content.split(/\r?\n/);
            if (content.length <= maxPayloadSize && lines.length === 1) {
                LSE_Logger.info(`${prefix}: ${content}`);
                return;
            }
            const totalLines = lines.length;
            LSE_Logger.info(`${prefix} [TOTAL LENGTH: ${content.length}, LINES: ${totalLines}]:`);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.length > maxPayloadSize) {
                    const chunks = Math.ceil(line.length / maxPayloadSize);
                    for (let j = 0; j < line.length; j += maxPayloadSize) {
                        const chunk = line.substring(j, j + maxPayloadSize);
                        const chunkNum = Math.floor(j / maxPayloadSize) + 1;
                        LSE_Logger.info(`${prefix} [${i+1}/${totalLines}][${chunkNum}/${chunks}]: ${chunk}`);
                    }
                } else {
                    LSE_Logger.info(`${prefix} [${i+1}/${totalLines}]: ${line}`);
                }
            }
        }
        
        LSE_Logger.info(`[FENNEL-NG RAW] ========== INCOMING REQUEST ${new Date().toISOString()} [${requestId}] ==========`);
        LSE_Logger.info(`[FENNEL-NG RAW] Method: ${req.method}`);
        LSE_Logger.info(`[FENNEL-NG RAW] URL: ${originalUrl}`);
        LSE_Logger.info(`[FENNEL-NG RAW] Query: ${JSON.stringify(req.query)}`);
        logLargeContent(`[FENNEL-NG RAW] Headers [${requestId}]`, JSON.stringify(req.headers, null, 2));
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
                    logLargeContent(`[FENNEL-NG RAW] DATA CONTENT [${requestId}]`, chunk.toString());
                    return handler.call(this, chunk);
                };
                return originalOn.call(this, event, wrappedHandler);
            } else if (event === 'end') {
                const wrappedHandler = function() {
                    LSE_Logger.info(`[FENNEL-NG RAW] END EVENT: Total body length: ${rawBody.length}`);
                    logLargeContent(`[FENNEL-NG RAW] [${requestId}]`, rawBody);
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
                logLargeContent(`[FENNEL-NG RAW] [${requestId}]`, chunkStr);
            }
            return originalWrite.call(this, chunk, encoding, callback);
        };
        res.end = function(chunk, encoding, callback) {
            if (chunk) {
                const chunkStr = chunk.toString();
                responseBody += chunkStr;
                LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE END: ${chunkStr.length} bytes`);
                logLargeContent(`[FENNEL-NG RAW] [${requestId}]`, chunkStr);
            }
            const endTime = Date.now();
            LSE_Logger.info(`[FENNEL-NG RAW] ========== OUTGOING RESPONSE ${new Date().toISOString()} [${requestId}] ==========`);
            LSE_Logger.info(`[FENNEL-NG RAW] Status Code: ${res.statusCode}`);
            LSE_Logger.info(`[FENNEL-NG RAW] Status Message: ${res.statusMessage || 'OK'}`);
            logLargeContent(`[FENNEL-NG RAW] Response Headers [${requestId}]`, JSON.stringify(res.getHeaders(), null, 2));
            LSE_Logger.info(`[FENNEL-NG RAW] Response Body Length: ${responseBody.length}`);
            logLargeContent(`[FENNEL-NG RAW] [${requestId}]`, responseBody);
            LSE_Logger.info(`[FENNEL-NG RAW] Request Duration: ${endTime - startTime}ms`);
            LSE_Logger.info(`[FENNEL-NG RAW] ======================================= [${requestId}]`);
            return originalEnd.call(this, chunk, encoding, callback);
        };
        res.json = function(obj) {
            const jsonStr = JSON.stringify(obj);
            logLargeContent(`[FENNEL-NG RAW] RESPONSE JSON [${requestId}]`, jsonStr);
            responseBody += jsonStr;
            return originalJson.call(this, obj);
        };
        res.send = function(body) {
            if (body) {
                const bodyStr = body.toString();
                logLargeContent(`[FENNEL-NG RAW] RESPONSE SEND [${requestId}]`, bodyStr);
                responseBody += bodyStr;
            }
            return originalSend.call(this, body);
        };
        res.on('finish', () => {
            LSE_Logger.info(`[FENNEL-NG RAW] RESPONSE FINISHED: Status=${res.statusCode}, Total Body=${responseBody.length} bytes [${requestId}]`);
        });
        res.on('close', () => {
            LSE_Logger.info(`[FENNEL-NG RAW] CONNECTION CLOSED: Status=${res.statusCode} [${requestId}]`);
        });
        next();
    };
}
module.exports = createDebugMiddleware;

