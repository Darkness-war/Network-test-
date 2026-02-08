// Template for deploying test servers in different regions
const express = require('express');
const os = require('os');
const cluster = require('cluster');
const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    console.log(`Server region: ${process.env.REGION || 'Unknown'}`);
    console.log(`CPU cores available: ${numCPUs}`);
    
    // Fork workers
    for (let i = 0; i < Math.min(numCPUs, 4); i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Restart worker
        cluster.fork();
    });
} else {
    const app = express();
    const PORT = process.env.PORT || 3001;
    const REGION = process.env.REGION || 'Unknown';
    
    // Worker-specific logic
    const activeConnections = new Set();
    let totalBytesServed = 0;
    let totalTests = 0;
    
    app.use((req, res, next) => {
        // Add connection tracking
        const connectionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        activeConnections.add(connectionId);
        
        req.on('close', () => {
            activeConnections.delete(connectionId);
        });
        
        // Set headers
        res.setHeader('X-Server-Region', REGION);
        res.setHeader('X-Server-PID', process.pid);
        res.setHeader('X-Worker-Id', cluster.worker.id);
        
        next();
    });
    
    // Generate test data
    const testDataCache = new Map();
    
    function getTestData(size) {
        if (!testDataCache.has(size)) {
            const data = Buffer.alloc(size);
            for (let i = 0; i < size; i++) {
                data[i] = Math.floor(Math.random() * 256);
            }
            testDataCache.set(size, data);
        }
        return testDataCache.get(size);
    }
    
    // Routes
    app.get('/ping', (req, res) => {
        const start = process.hrtime();
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Length', '4');
        res.send('pong');
        
        const diff = process.hrtime(start);
        const latency = (diff[0] * 1000) + (diff[1] / 1000000);
        
        console.log(`[Worker ${cluster.worker.id}] Ping: ${latency.toFixed(2)}ms`);
    });
    
    app.get('/download', (req, res) => {
        totalTests++;
        
        const size = Math.min(parseInt(req.query.size) || 10 * 1024 * 1024, 100 * 1024 * 1024);
        const data = getTestData(size);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        const start = Date.now();
        
        // Stream data in chunks
        const chunkSize = 256 * 1024; // 256KB chunks
        let offset = 0;
        
        function sendChunk() {
            if (offset >= size) {
                totalBytesServed += size;
                const duration = Date.now() - start;
                const speed = (size * 8) / (duration / 1000) / 1000000;
                
                console.log(`[Worker ${cluster.worker.id}] Download: ${(size/1048576).toFixed(1)}MB, ${duration}ms, ${speed.toFixed(1)}Mbps`);
                res.end();
                return;
            }
            
            const end = Math.min(offset + chunkSize, size);
            const chunk = data.slice(offset, end);
            
            if (res.write(chunk)) {
                offset = end;
                setImmediate(sendChunk);
            } else {
                res.once('drain', sendChunk);
            }
        }
        
        sendChunk();
    });
    
    app.post('/upload', (req, res) => {
        totalTests++;
        
        let received = 0;
        const start = Date.now();
        
        req.on('data', (chunk) => {
            received += chunk.length;
        });
        
        req.on('end', () => {
            const duration = Date.now() - start;
            const speed = (received * 8) / (duration / 1000) / 1000000;
            
            console.log(`[Worker ${cluster.worker.id}] Upload: ${(received/1048576).toFixed(1)}MB, ${duration}ms, ${speed.toFixed(1)}Mbps`);
            
            res.json({
                success: true,
                bytes: received,
                duration: duration,
                speedMbps: speed,
                server: REGION,
                worker: cluster.worker.id
            });
        });
    });
    
    app.get('/stats', (req, res) => {
        res.json({
            region: REGION,
            pid: process.pid,
            workerId: cluster.worker.id,
            activeConnections: activeConnections.size,
            totalTests: totalTests,
            totalBytesServed: totalBytesServed,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    });
    
    // Start server
    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} (${cluster.worker.id}) started on port ${PORT} in region ${REGION}`);
    });
}
