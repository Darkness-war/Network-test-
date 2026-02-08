const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;
const TEST_SERVER_PORT = process.env.TEST_SERVER_PORT || 3001;

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://localhost:3000", "http://localhost:3001", "ws://localhost:3000"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:8080', 'http://127.0.0.1:8080'],
    credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// In-memory store for test results (use Redis in production)
const testResults = new Map();
const serverStats = new Map();

// Test servers configuration
const testServers = [
    {
        id: 1,
        name: 'Primary Server',
        location: 'New York, USA',
        country: 'US',
        city: 'New York',
        coordinates: { lat: 40.7128, lon: -74.0060 },
        host: 'localhost',
        port: TEST_SERVER_PORT,
        capacity: 1000,
        activeConnections: 0,
        status: 'online'
    },
    {
        id: 2,
        name: 'Europe Server',
        location: 'London, UK',
        country: 'GB',
        city: 'London',
        coordinates: { lat: 51.5074, lon: -0.1278 },
        host: 'london.speedtest.example.com',
        port: 3001,
        capacity: 800,
        activeConnections: 0,
        status: 'online'
    },
    {
        id: 3,
        name: 'Asia Server',
        location: 'Singapore',
        country: 'SG',
        city: 'Singapore',
        coordinates: { lat: 1.3521, lon: 103.8198 },
        host: 'singapore.speedtest.example.com',
        port: 3001,
        capacity: 600,
        activeConnections: 0,
        status: 'online'
    },
    {
        id: 4,
        name: 'Australia Server',
        location: 'Sydney, Australia',
        country: 'AU',
        city: 'Sydney',
        coordinates: { lat: -33.8688, lon: 151.2093 },
        host: 'sydney.speedtest.example.com',
        port: 3001,
        capacity: 500,
        activeConnections: 0,
        status: 'online'
    }
];

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// API Routes

// Get user information
app.get('/api/user-info', (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
        const geo = geoip.lookup(ip);
        const parser = new UAParser(req.headers['user-agent']);
        const ua = parser.getResult();
        
        const userInfo = {
            ip: ip,
            userAgent: ua,
            geo: geo || {},
            isp: 'Unknown', // In production, use a service like ipinfo.io
            timestamp: new Date().toISOString()
        };
        
        logger.info(`User info requested: ${ip}`);
        res.json(userInfo);
    } catch (error) {
        logger.error(`Error getting user info: ${error.message}`);
        res.status(500).json({ error: 'Failed to get user information' });
    }
});

// Get available servers
app.get('/api/servers', (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const geo = geoip.lookup(clientIp);
        
        let serversWithDistance = [...testServers];
        
        if (geo && geo.ll) {
            serversWithDistance = serversWithDistance.map(server => ({
                ...server,
                distance: calculateDistance(geo.ll[0], geo.ll[1], server.coordinates.lat, server.coordinates.lon),
                latency: Math.floor(Math.random() * 50) + 10 // Simulated latency
            })).sort((a, b) => a.distance - b.distance);
        }
        
        res.json(serversWithDistance);
    } catch (error) {
        logger.error(`Error getting servers: ${error.message}`);
        res.status(500).json({ error: 'Failed to get servers' });
    }
});

// Get optimal server based on client location
app.get('/api/optimal-server', (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const geo = geoip.lookup(clientIp);
        
        if (!geo || !geo.ll) {
            // Return primary server if location cannot be determined
            return res.json(testServers[0]);
        }
        
        // Find the closest server
        let optimalServer = null;
        let minDistance = Infinity;
        
        for (const server of testServers) {
            const distance = calculateDistance(
                geo.ll[0], geo.ll[1],
                server.coordinates.lat, server.coordinates.lon
            );
            
            if (distance < minDistance && server.status === 'online') {
                minDistance = distance;
                optimalServer = { ...server, distance };
            }
        }
        
        if (!optimalServer) {
            optimalServer = testServers[0];
        }
        
        // Simulate latency based on distance
        optimalServer.latency = Math.floor(minDistance * 0.1) + 10;
        
        res.json(optimalServer);
    } catch (error) {
        logger.error(`Error finding optimal server: ${error.message}`);
        res.status(500).json({ error: 'Failed to find optimal server' });
    }
});

// Save test results
app.post('/api/save-results', (req, res) => {
    try {
        const testId = uuidv4();
        const results = req.body;
        
        // Add metadata
        results.id = testId;
        results.timestamp = new Date().toISOString();
        results.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        // Store results
        testResults.set(testId, results);
        
        // Update server stats
        if (results.server && results.server.id) {
            const serverId = results.server.id;
            const stats = serverStats.get(serverId) || {
                totalTests: 0,
                avgPing: 0,
                avgDownload: 0,
                avgUpload: 0,
                lastUpdated: new Date().toISOString()
            };
            
            stats.totalTests++;
            stats.avgPing = (stats.avgPing * (stats.totalTests - 1) + results.results.ping) / stats.totalTests;
            stats.avgDownload = (stats.avgDownload * (stats.totalTests - 1) + results.results.download) / stats.totalTests;
            stats.avgUpload = (stats.avgUpload * (stats.totalTests - 1) + results.results.upload) / stats.totalTests;
            stats.lastUpdated = new Date().toISOString();
            
            serverStats.set(serverId, stats);
        }
        
        logger.info(`Test results saved: ${testId}`);
        
        // In production, save to database here
        // await database.saveResults(results);
        
        res.json({ 
            success: true, 
            testId: testId,
            message: 'Results saved successfully'
        });
    } catch (error) {
        logger.error(`Error saving results: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save results' 
        });
    }
});

// Get test results by ID
app.get('/api/results/:id', (req, res) => {
    try {
        const testId = req.params.id;
        const results = testResults.get(testId);
        
        if (!results) {
            return res.status(404).json({ 
                success: false, 
                error: 'Test results not found' 
            });
        }
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        logger.error(`Error getting results: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get results' 
        });
    }
});

// Get server statistics
app.get('/api/server-stats', (req, res) => {
    try {
        const stats = {};
        
        for (const [serverId, server] of testServers.entries()) {
            stats[serverId] = {
                ...server,
                stats: serverStats.get(server.id) || {
                    totalTests: 0,
                    avgPing: 0,
                    avgDownload: 0,
                    avgUpload: 0
                }
            };
        }
        
        res.json({
            success: true,
            stats: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting server stats: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get server statistics' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        servers: testServers.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status,
            activeConnections: s.activeConnections
        }))
    });
});

// Ping endpoint for latency testing
app.get('/api/ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send('pong');
});

// Proxy requests to test servers
app.use('/test-server', createProxyMiddleware({
    target: `http://localhost:${TEST_SERVER_PORT}`,
    changeOrigin: true,
    pathRewrite: {
        '^/test-server': ''
    },
    onProxyReq: (proxyReq, req, res) => {
        // Add client IP to headers
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        proxyReq.setHeader('X-Client-IP', clientIp);
        
        // Update server connection count
        const serverId = req.query.serverId || 1;
        const server = testServers.find(s => s.id == serverId);
        if (server) {
            server.activeConnections++;
            
            // Decrease count when connection ends
            req.on('close', () => {
                server.activeConnections = Math.max(0, server.activeConnections - 1);
            });
        }
    }
}));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '../frontend');
    
    // Check if frontend exists
    if (fs.existsSync(frontendPath)) {
        app.use(express.static(frontendPath));
        
        // Handle SPA routing
        app.get('*', (req, res) => {
            res.sendFile(path.join(frontendPath, 'index.html'));
        });
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    logger.info(`SpeedTest API server running on port ${PORT}`);
    console.log(`🚀 API Server: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 User info: http://localhost:${PORT}/api/user-info`);
    console.log(`🖥️  Servers list: http://localhost:${PORT}/api/servers`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
