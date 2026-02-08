const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Disable caching for test endpoints
app.use((req, res, next) => {
    if (req.path.includes('/download') || req.path.includes('/upload') || req.path.includes('/ping')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Generate random data for download tests
function generateRandomData(size) {
    return Buffer.alloc(size, Math.random().toString(36).substr(2));
}

// Store active connections
const activeConnections = new Set();

// Ping endpoint - for latency testing
app.get('/ping', (req, res) => {
    const start = Date.now();
    
    // Add connection
    const connectionId = Math.random().toString(36).substr(2, 9);
    activeConnections.add(connectionId);
    
    req.on('close', () => {
        activeConnections.delete(connectionId);
    });
    
    // Minimal response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', '4');
    res.send('pong');
    
    // Log latency
    const latency = Date.now() - start;
    console.log(`Ping request: ${latency}ms latency`);
});

// Download endpoint - for download speed testing
app.get('/download', (req, res) => {
    const startTime = Date.now();
    const connectionId = Math.random().toString(36).substr(2, 9);
    
    // Get requested size (default 10MB)
    let size = parseInt(req.query.size) || 10 * 1024 * 1024;
    
    // Limit size for safety
    if (size > 100 * 1024 * 1024) { // Max 100MB
        size = 100 * 1024 * 1024;
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', size);
    res.setHeader('Content-Disposition', 'attachment; filename="speedtest.dat"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Generate and stream data
    const chunkSize = 64 * 1024; // 64KB chunks
    let bytesSent = 0;
    
    activeConnections.add(connectionId);
    
    function sendChunk() {
        if (bytesSent >= size || !activeConnections.has(connectionId)) {
            activeConnections.delete(connectionId);
            res.end();
            
            const duration = Date.now() - startTime;
            const speed = (size * 8) / (duration / 1000) / 1000000; // Mbps
            console.log(`Download complete: ${(size / (1024*1024)).toFixed(1)}MB in ${duration}ms (${speed.toFixed(1)} Mbps)`);
            return;
        }
        
        const remaining = size - bytesSent;
        const currentChunkSize = Math.min(chunkSize, remaining);
        
        // Generate random data for this chunk
        const chunk = generateRandomData(currentChunkSize);
        
        if (res.write(chunk)) {
            bytesSent += currentChunkSize;
            
            // Continue sending
            if (bytesSent < size) {
                setImmediate(sendChunk);
            } else {
                sendChunk(); // Final call
            }
        } else {
            // Wait for drain event
            res.once('drain', sendChunk);
        }
    }
    
    // Handle client disconnect
    req.on('close', () => {
        activeConnections.delete(connectionId);
    });
    
    // Start sending data
    sendChunk();
});

// Upload endpoint - for upload speed testing
app.post('/upload', (req, res) => {
    const startTime = Date.now();
    const connectionId = Math.random().toString(36).substr(2, 9);
    
    let bytesReceived = 0;
    
    activeConnections.add(connectionId);
    
    // Track progress
    req.on('data', (chunk) => {
        bytesReceived += chunk.length;
    });
    
    req.on('end', () => {
        activeConnections.delete(connectionId);
        
        const duration = Date.now() - startTime;
        const speed = (bytesReceived * 8) / (duration / 1000) / 1000000; // Mbps
        
        console.log(`Upload complete: ${(bytesReceived / (1024*1024)).toFixed(1)}MB in ${duration}ms (${speed.toFixed(1)} Mbps)`);
        
        // Send response with stats
        res.json({
            success: true,
            bytesReceived: bytesReceived,
            duration: duration,
            speedMbps: speed,
            timestamp: new Date().toISOString()
        });
    });
    
    req.on('close', () => {
        activeConnections.delete(connectionId);
    });
    
    // Handle errors
    req.on('error', (err) => {
        console.error('Upload error:', err);
        activeConnections.delete(connectionId);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Upload failed'
            });
        }
    });
});

// Multi-threaded download (for more accurate testing)
app.get('/download-multi', (req, res) => {
    const threads = parseInt(req.query.threads) || 4;
    const sizePerThread = parseInt(req.query.size) || 5 * 1024 * 1024; // 5MB per thread
    
    res.setHeader('Content-Type', 'application/json');
    
    // Return instructions for parallel download
    res.json({
        success: true,
        threads: threads,
        sizePerThread: sizePerThread,
        totalSize: threads * sizePerThread,
        urls: Array.from({ length: threads }, (_, i) => 
            `/download?size=${sizePerThread}&thread=${i}&t=${Date.now()}`
        ),
        timestamp: new Date().toISOString()
    });
});

// Server statistics
app.get('/stats', (req, res) => {
    res.json({
        activeConnections: activeConnections.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeConnections: activeConnections.size
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`⚡ Test Server running on port ${PORT}`);
    console.log(`📥 Download test: http://localhost:${PORT}/download?size=10485760`);
    console.log(`📤 Upload test: POST http://localhost:${PORT}/upload`);
    console.log(`📊 Server stats: http://localhost:${PORT}/stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down test server');
    server.close(() => {
        console.log('Test server shut down');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down test server');
    server.close(() => {
        console.log('Test server shut down');
        process.exit(0);
    });
});

module.exports = app;
