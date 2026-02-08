class SpeedTest {
    constructor() {
        this.config = {
            downloadSize: 50 * 1024 * 1024, // 50MB
            uploadSize: 25 * 1024 * 1024,   // 25MB
            testDuration: 10000,            // 10 seconds per test
            pingCount: 10,
            testServers: [],
            selectedServer: null,
            isTesting: false,
            testResults: {
                ping: 0,
                jitter: 0,
                download: 0,
                upload: 0,
                packetLoss: 0
            }
        };

        this.currentTest = null;
        this.testStartTime = null;
        this.loadedBytes = 0;
        this.uploadedBytes = 0;
        this.pingTimes = [];
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadServers();
        await this.detectUserInfo();
        this.setupServiceWorker();
    }

    bindEvents() {
        // Dark mode toggle
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const icon = document.querySelector('#darkModeToggle i');
            if (document.body.classList.contains('dark-mode')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        });

        // Start test button
        document.getElementById('startTestBtn').addEventListener('click', () => {
            this.startTest();
        });

        // Server selection modal
        document.getElementById('changeServerBtn').addEventListener('click', () => {
            this.showServerModal();
        });

        document.getElementById('closeServerModal').addEventListener('click', () => {
            this.hideServerModal();
        });

        // Close modal on outside click
        document.getElementById('serverModal').addEventListener('click', (e) => {
            if (e.target.id === 'serverModal') {
                this.hideServerModal();
            }
        });

        // Share results
        document.getElementById('shareResultsBtn').addEventListener('click', () => {
            this.shareResults();
        });

        // Server search
        document.getElementById('serverSearch').addEventListener('input', (e) => {
            this.filterServers(e.target.value);
        });

        // History
        document.getElementById('historyBtn').addEventListener('click', () => {
            this.showHistory();
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });
    }

    async loadServers() {
        try {
            const response = await fetch('/api/servers');
            const servers = await response.json();
            
            this.config.testServers = servers.map(server => ({
                id: server.id,
                name: server.name,
                location: server.location,
                country: server.country,
                host: server.host,
                port: server.port,
                distance: 0,
                latency: 0
            }));

            // Auto-select best server
            await this.selectBestServer();
            this.renderServerList();
        } catch (error) {
            console.error('Failed to load servers:', error);
            this.loadDefaultServers();
        }
    }

    loadDefaultServers() {
        this.config.testServers = [
            {
                id: 1,
                name: 'Primary Server',
                location: 'New York, USA',
                country: 'US',
                host: window.location.hostname,
                port: 3000,
                distance: 0,
                latency: 0
            },
            {
                id: 2,
                name: 'Backup Server',
                location: 'London, UK',
                country: 'GB',
                host: 'london.speedtest.example.com',
                port: 3000,
                distance: 0,
                latency: 0
            }
        ];
    }

    async detectUserInfo() {
        try {
            const response = await fetch('/api/user-info');
            const data = await response.json();
            
            document.getElementById('userIp').textContent = data.ip;
            document.getElementById('userIsp').textContent = data.isp || 'Unknown';
            
            // Update location-based suggestions
            if (data.country) {
                this.filterServersByCountry(data.country);
            }
        } catch (error) {
            console.error('Failed to detect user info:', error);
            document.getElementById('userIp').textContent = 'Unknown';
            document.getElementById('userIsp').textContent = 'Unknown';
        }
    }

    async selectBestServer() {
        if (this.config.testServers.length === 0) return;

        let bestServer = null;
        let bestLatency = Infinity;

        // Test latency to each server
        for (const server of this.config.testServers.slice(0, 5)) {
            try {
                const latency = await this.testLatency(server.host, server.port);
                server.latency = latency;
                
                if (latency < bestLatency) {
                    bestLatency = latency;
                    bestServer = server;
                }
            } catch (error) {
                console.warn(`Failed to ping ${server.name}:`, error);
            }
        }

        this.config.selectedServer = bestServer || this.config.testServers[0];
        this.updateServerDisplay();
    }

    async testLatency(host, port) {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            const img = new Image();
            
            img.onload = () => {
                const latency = performance.now() - startTime;
                resolve(latency);
            };
            
            img.onerror = () => {
                const latency = performance.now() - startTime;
                resolve(latency);
            };
            
            // Use a cache-busting parameter
            img.src = `http://${host}:${port}/ping?t=${Date.now()}`;
            
            setTimeout(() => {
                reject(new Error('Timeout'));
            }, 5000);
        });
    }

    updateServerDisplay() {
        const server = this.config.selectedServer;
        if (!server) return;

        document.getElementById('currentServer').textContent = `${server.name} - ${server.location}`;
        document.getElementById('serverLocation').textContent = server.location;
        document.getElementById('serverDistance').textContent = server.distance > 0 ? 
            `${Math.round(server.distance)} km` : '- km';
        document.getElementById('serverPing').textContent = server.latency > 0 ? 
            `${Math.round(server.latency)} ms` : '- ms';
    }

    renderServerList() {
        const serverList = document.getElementById('serverList');
        serverList.innerHTML = '';

        this.config.testServers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.innerHTML = `
                <div class="server-item-main">
                    <div class="server-item-icon">
                        <i class="fas fa-server"></i>
                    </div>
                    <div class="server-item-info">
                        <div class="server-item-name">${server.name}</div>
                        <div class="server-item-location">${server.location}</div>
                    </div>
                </div>
                <div class="server-item-stats">
                    <span class="server-item-latency">${server.latency ? Math.round(server.latency) + ' ms' : 'Testing...'}</span>
                    <span class="server-item-distance">${server.distance ? Math.round(server.distance) + ' km' : ''}</span>
                </div>
                <button class="server-item-select" data-server-id="${server.id}">
                    ${server.id === this.config.selectedServer?.id ? 'Selected' : 'Select'}
                </button>
            `;

            // Add click handler
            const selectBtn = serverElement.querySelector('.server-item-select');
            selectBtn.addEventListener('click', () => {
                this.selectServer(server.id);
                this.hideServerModal();
            });

            serverList.appendChild(serverElement);
        });
    }

    selectServer(serverId) {
        const server = this.config.testServers.find(s => s.id === serverId);
        if (server) {
            this.config.selectedServer = server;
            this.updateServerDisplay();
            this.updateServerButtons();
        }
    }

    updateServerButtons() {
        document.querySelectorAll('.server-item-select').forEach(btn => {
            const serverId = parseInt(btn.dataset.serverId);
            if (serverId === this.config.selectedServer.id) {
                btn.textContent = 'Selected';
                btn.disabled = true;
                btn.style.opacity = '0.7';
            } else {
                btn.textContent = 'Select';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });
    }

    filterServers(searchTerm) {
        const servers = document.querySelectorAll('.server-item');
        const term = searchTerm.toLowerCase();

        servers.forEach(server => {
            const text = server.textContent.toLowerCase();
            server.style.display = text.includes(term) ? 'flex' : 'none';
        });
    }

    filterServersByCountry(countryCode) {
        // Filter and sort servers by country
        this.config.testServers.sort((a, b) => {
            if (a.country === countryCode && b.country !== countryCode) return -1;
            if (a.country !== countryCode && b.country === countryCode) return 1;
            return 0;
        });
        this.renderServerList();
    }

    showServerModal() {
        document.getElementById('serverModal').classList.add('show');
    }

    hideServerModal() {
        document.getElementById('serverModal').classList.remove('show');
    }

    async startTest() {
        if (this.config.isTesting) {
            this.stopTest();
            return;
        }

        this.config.isTesting = true;
        this.resetTest();
        this.updateTestButton(true);

        try {
            // Generate test ID
            const testId = 'TEST_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            document.getElementById('testId').textContent = testId;
            document.getElementById('testTimestamp').textContent = new Date().toLocaleString();

            // Run tests in sequence
            await this.runPingTest();
            await this.runDownloadTest();
            await this.runUploadTest();
            await this.calculateJitter();
            
            this.saveResults(testId);
            this.showCompletion();
        } catch (error) {
            console.error('Test failed:', error);
            this.showError(error.message);
        } finally {
            this.config.isTesting = false;
            this.updateTestButton(false);
        }
    }

    stopTest() {
        if (this.currentTest) {
            this.currentTest.abort();
        }
        this.config.isTesting = false;
        this.updateTestButton(false);
        this.updateProgress('Test stopped', 0);
    }

    resetTest() {
        this.testResults = {
            ping: 0,
            jitter: 0,
            download: 0,
            upload: 0,
            packetLoss: 0
        };
        
        this.pingTimes = [];
        this.loadedBytes = 0;
        this.uploadedBytes = 0;
        
        // Reset gauges
        this.updateGauge('pingGauge', 0, 'ms');
        this.updateGauge('downloadGauge', 0, 'Mbps');
        this.updateGauge('uploadGauge', 0, 'Mbps');
        
        // Reset status
        document.getElementById('pingStatus').textContent = 'Ready';
        document.getElementById('downloadStatus').textContent = 'Ready';
        document.getElementById('uploadStatus').textContent = 'Ready';
        
        // Reset metrics
        document.getElementById('jitterValue').textContent = '0 ms';
        document.getElementById('packetLossValue').textContent = '0%';
        document.getElementById('signalQuality').textContent = '-';
    }

    updateTestButton(testing) {
        const btn = document.getElementById('startTestBtn');
        const icon = btn.querySelector('i');
        const text = btn.querySelector('span');
        
        if (testing) {
            icon.classList.remove('fa-play');
            icon.classList.add('fa-stop');
            text.textContent = 'Stop Test';
            btn.classList.add('status-testing');
        } else {
            icon.classList.remove('fa-stop');
            icon.classList.add('fa-play');
            text.textContent = 'Start Speed Test';
            btn.classList.remove('status-testing');
        }
    }

    updateProgress(phase, percent) {
        document.getElementById('testPhase').textContent = phase;
        document.getElementById('progressPercent').textContent = `${Math.round(percent)}%`;
        document.getElementById('testProgress').style.width = `${percent}%`;
    }

    updateGauge(gaugeId, value, unit) {
        const gauge = document.getElementById(gaugeId);
        const valueElement = gauge.querySelector('.gauge-value');
        const unitElement = gauge.querySelector('.gauge-unit');
        
        // Animate value change
        const startValue = parseFloat(valueElement.textContent) || 0;
        const endValue = value;
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const currentValue = startValue + (endValue - startValue) * easeOutQuart;
            
            valueElement.textContent = currentValue.toFixed(unit === 'ms' ? 0 : 1);
            
            // Update gauge visual
            const percentage = Math.min((currentValue / this.getMaxValue(unit)) * 100, 100);
            gauge.style.background = `conic-gradient(
                var(--primary-color) 0%,
                var(--primary-color) ${percentage}%,
                ${document.body.classList.contains('dark-mode') ? 'var(--gray-700)' : 'var(--gray-200)'} ${percentage}%,
                ${document.body.classList.contains('dark-mode') ? 'var(--gray-700)' : 'var(--gray-200)'} 100%
            )`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
        unitElement.textContent = unit;
    }

    getMaxValue(unit) {
        switch(unit) {
            case 'ms': return 200; // Max ping display
            case 'Mbps': return 1000; // Max speed display
            default: return 100;
        }
    }

    async runPingTest() {
        this.updateProgress('Testing ping...', 10);
        document.getElementById('pingStatus').textContent = 'Testing...';
        document.getElementById('pingStatus').classList.add('pulse');

        const server = this.config.selectedServer;
        const pings = [];

        for (let i = 0; i < this.config.pingCount; i++) {
            try {
                const startTime = performance.now();
                await fetch(`http://${server.host}:${server.port}/ping?t=${Date.now()}`);
                const latency = performance.now() - startTime;
                
                pings.push(latency);
                this.updateGauge('pingGauge', latency, 'ms');
                
                // Update progress within ping test
                const progress = 10 + (i / this.config.pingCount) * 20;
                this.updateProgress(`Testing ping... (${i + 1}/${this.config.pingCount})`, progress);
                
                // Small delay between pings
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`Ping ${i + 1} failed:`, error);
            }
        }

        if (pings.length > 0) {
            const avgPing = pings.reduce((a, b) => a + b) / pings.length;
            this.testResults.ping = avgPing;
            this.pingTimes = pings;
            this.updateGauge('pingGauge', avgPing, 'ms');
            document.getElementById('pingStatus').textContent = 'Complete';
            document.getElementById('pingStatus').classList.remove('pulse');
        } else {
            throw new Error('Ping test failed');
        }
    }

    async runDownloadTest() {
        this.updateProgress('Testing download speed...', 30);
        document.getElementById('downloadStatus').textContent = 'Testing...';
        document.getElementById('downloadStatus').classList.add('pulse');

        const server = this.config.selectedServer;
        const testDuration = this.config.testDuration;
        const startTime = performance.now();
        let totalBytes = 0;
        
        // Create multiple parallel connections for accurate testing
        const connections = 4;
        const chunkSize = this.config.downloadSize / connections;
        
        const downloadPromises = [];
        
        for (let i = 0; i < connections; i++) {
            const promise = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const url = `http://${server.host}:${server.port}/download?size=${chunkSize}&t=${Date.now() + i}`;
                
                xhr.open('GET', url, true);
                xhr.responseType = 'blob';
                
                xhr.onprogress = (event) => {
                    if (event.lengthComputable) {
                        totalBytes += event.loaded - (this.loadedBytes || 0);
                        this.loadedBytes = event.loaded;
                        
                        const elapsed = performance.now() - startTime;
                        if (elapsed > 0) {
                            const speed = (totalBytes * 8) / (elapsed * 1000); // Mbps
                            this.updateGauge('downloadGauge', speed, 'Mbps');
                            
                            const progress = 30 + (elapsed / testDuration) * 50;
                            this.updateProgress(
                                `Downloading... ${this.formatBytes(totalBytes)}`,
                                Math.min(progress, 80)
                            );
                        }
                    }
                };
                
                xhr.onload = () => resolve();
                xhr.onerror = () => reject(new Error('Download failed'));
                
                xhr.send();
            });
            
            downloadPromises.push(promise);
        }

        // Race between completion and timeout
        await Promise.race([
            Promise.all(downloadPromises),
            new Promise(resolve => setTimeout(resolve, testDuration))
        ]);

        const elapsed = performance.now() - startTime;
        const speedMbps = (totalBytes * 8) / (elapsed * 1000);
        
        this.testResults.download = speedMbps;
        this.updateGauge('downloadGauge', speedMbps, 'Mbps');
        
        document.getElementById('downloadStatus').textContent = 'Complete';
        document.getElementById('downloadStatus').classList.remove('pulse');
    }

    async runUploadTest() {
        this.updateProgress('Testing upload speed...', 80);
        document.getElementById('uploadStatus').textContent = 'Testing...';
        document.getElementById('uploadStatus').classList.add('pulse');

        const server = this.config.selectedServer;
        const testDuration = this.config.testDuration;
        const startTime = performance.now();
        let totalBytes = 0;
        
        // Generate random data for upload
        const data = new ArrayBuffer(this.config.uploadSize);
        const view = new Uint8Array(data);
        for (let i = 0; i < data.byteLength; i++) {
            view[i] = Math.floor(Math.random() * 256);
        }
        
        const blob = new Blob([data]);
        
        const xhr = new XMLHttpRequest();
        const url = `http://${server.host}:${server.port}/upload`;
        
        return new Promise((resolve, reject) => {
            xhr.open('POST', url, true);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    totalBytes = event.loaded;
                    const elapsed = performance.now() - startTime;
                    
                    if (elapsed > 0) {
                        const speed = (totalBytes * 8) / (elapsed * 1000); // Mbps
                        this.updateGauge('uploadGauge', speed, 'Mbps');
                        
                        const progress = 80 + (elapsed / testDuration) * 20;
                        this.updateProgress(
                            `Uploading... ${this.formatBytes(totalBytes)}`,
                            Math.min(progress, 95)
                        );
                    }
                }
            };
            
            xhr.onload = () => {
                const elapsed = performance.now() - startTime;
                const speedMbps = (totalBytes * 8) / (elapsed * 1000);
                
                this.testResults.upload = speedMbps;
                this.updateGauge('uploadGauge', speedMbps, 'Mbps');
                
                document.getElementById('uploadStatus').textContent = 'Complete';
                document.getElementById('uploadStatus').classList.remove('pulse');
                resolve();
            };
            
            xhr.onerror = () => {
                reject(new Error('Upload test failed'));
            };
            
            // Send the data
            xhr.send(blob);
            
            // Timeout after test duration
            setTimeout(() => {
                xhr.abort();
                const elapsed = performance.now() - startTime;
                const speedMbps = (totalBytes * 8) / (elapsed * 1000);
                
                this.testResults.upload = speedMbps;
                this.updateGauge('uploadGauge', speedMbps, 'Mbps');
                
                document.getElementById('uploadStatus').textContent = 'Complete';
                document.getElementById('uploadStatus').classList.remove('pulse');
                resolve();
            }, testDuration);
        });
    }

    async calculateJitter() {
        if (this.pingTimes.length < 2) return;

        const jitters = [];
        for (let i = 1; i < this.pingTimes.length; i++) {
            jitters.push(Math.abs(this.pingTimes[i] - this.pingTimes[i - 1]));
        }
        
        const avgJitter = jitters.reduce((a, b) => a + b) / jitters.length;
        this.testResults.jitter = avgJitter;
        
        document.getElementById('jitterValue').textContent = `${avgJitter.toFixed(1)} ms`;
        
        // Calculate packet loss (simulated for demo)
        const packetLoss = Math.random() * 0.5; // 0-0.5% for demo
        this.testResults.packetLoss = packetLoss;
        document.getElementById('packetLossValue').textContent = `${packetLoss.toFixed(2)}%`;
        
        // Estimate signal quality
        const signalQuality = this.estimateSignalQuality();
        document.getElementById('signalQuality').textContent = signalQuality;
    }

    estimateSignalQuality() {
        const { ping, jitter, packetLoss } = this.testResults;
        
        let score = 100;
        
        if (ping > 100) score -= 30;
        else if (ping > 50) score -= 15;
        
        if (jitter > 10) score -= 20;
        else if (jitter > 5) score -= 10;
        
        if (packetLoss > 0.1) score -= 20;
        else if (packetLoss > 0.05) score -= 10;
        
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Good';
        if (score >= 70) return 'Fair';
        if (score >= 60) return 'Poor';
        return 'Bad';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    saveResults(testId) {
        const results = {
            id: testId,
            timestamp: new Date().toISOString(),
            server: this.config.selectedServer,
            results: this.testResults,
            userInfo: {
                ip: document.getElementById('userIp').textContent,
                isp: document.getElementById('userIsp').textContent
            }
        };

        // Save to localStorage
        let history = JSON.parse(localStorage.getItem('speedtest_history') || '[]');
        history.unshift(results);
        
        // Keep only last 50 tests
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        localStorage.setItem('speedtest_history', JSON.stringify(history));
        
        // Send to server (optional)
        this.sendResultsToServer(results);
    }

    async sendResultsToServer(results) {
        try {
            await fetch('/api/save-results', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(results)
            });
        } catch (error) {
            console.error('Failed to save results to server:', error);
        }
    }

    showCompletion() {
        this.updateProgress('Test complete!', 100);
        
        // Show notification
        this.showNotification('Speed test completed successfully!', 'success');
        
        // Update result quality indicator
        const quality = this.estimateSignalQuality();
        const gaugeStatuses = document.querySelectorAll('.gauge-status');
        
        gaugeStatuses.forEach(status => {
            status.classList.add('status-complete');
        });
    }

    showError(message) {
        this.updateProgress('Test failed', 0);
        
        const gaugeStatuses = document.querySelectorAll('.gauge-status');
        gaugeStatuses.forEach(status => {
            status.textContent = 'Error';
            status.classList.add('status-error');
        });
        
        this.showNotification(`Test failed: ${message}`, 'error');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add to container
        const container = document.querySelector('.container');
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }

    async shareResults() {
        const results = this.testResults;
        const text = `My SpeedTest Results:
        Ping: ${results.ping.toFixed(0)} ms
        Download: ${results.download.toFixed(1)} Mbps
        Upload: ${results.upload.toFixed(1)} Mbps
        Jitter: ${results.jitter.toFixed(1)} ms`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'SpeedTest Results',
                    text: text,
                    url: window.location.href
                });
            } catch (error) {
                console.log('Sharing cancelled:', error);
            }
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('Results copied to clipboard!', 'success');
            });
        }
    }

    showHistory() {
        const history = JSON.parse(localStorage.getItem('speedtest_history') || '[]');
        
        if (history.length === 0) {
            this.showNotification('No test history found', 'info');
            return;
        }
        
        // Create history modal
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-history"></i> Test History</h2>
                    <button class="btn-close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="history-list">
                        ${history.map((test, index) => `
                            <div class="history-item">
                                <div class="history-item-header">
                                    <span class="history-item-id">${test.id}</span>
                                    <span class="history-item-date">${new Date(test.timestamp).toLocaleString()}</span>
                                </div>
                                <div class="history-item-stats">
                                    <div class="history-stat">
                                        <span class="history-stat-label">Ping:</span>
                                        <span class="history-stat-value">${test.results.ping.toFixed(0)} ms</span>
                                    </div>
                                    <div class="history-stat">
                                        <span class="history-stat-label">Download:</span>
                                        <span class="history-stat-value">${test.results.download.toFixed(1)} Mbps</span>
                                    </div>
                                    <div class="history-stat">
                                        <span class="history-stat-label">Upload:</span>
                                        <span class="history-stat-value">${test.results.upload.toFixed(1)} Mbps</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close handlers
        modal.querySelector('.btn-close-modal').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.parentNode.removeChild(modal);
                    }
                }, 300);
            }
        });
    }

    showSettings() {
        // Create settings modal
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-cog"></i> Settings</h2>
                    <button class="btn-close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="settings-group">
                        <h3>Test Configuration</h3>
                        <div class="setting-item">
                            <label for="downloadSize">Download Test Size:</label>
                            <select id="downloadSize">
                                <option value="10485760">10 MB</option>
                                <option value="26214400" selected>25 MB</option>
                                <option value="52428800">50 MB</option>
                                <option value="104857600">100 MB</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label for="uploadSize">Upload Test Size:</label>
                            <select id="uploadSize">
                                <option value="5242880">5 MB</option>
                                <option value="10485760">10 MB</option>
                                <option value="26214400" selected>25 MB</option>
                                <option value="52428800">50 MB</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label for="testDuration">Test Duration (seconds):</label>
                            <input type="range" id="testDuration" min="5" max="30" value="10">
                            <span id="durationValue">10</span>
                        </div>
                    </div>
                    <div class="settings-group">
                        <h3>Display Options</h3>
                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="autoDarkMode" checked>
                                Auto Dark Mode
                            </label>
                        </div>
                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="animations" checked>
                                Enable Animations
                            </label>
                        </div>
                    </div>
                    <div class="settings-actions">
                        <button class="btn-save-settings">Save Settings</button>
                        <button class="btn-reset-settings">Reset to Defaults</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Load current settings
        const settings = JSON.parse(localStorage.getItem('speedtest_settings') || '{}');
        if (settings.downloadSize) document.getElementById('downloadSize').value = settings.downloadSize;
        if (settings.uploadSize) document.getElementById('uploadSize').value = settings.uploadSize;
        if (settings.testDuration) {
            document.getElementById('testDuration').value = settings.testDuration;
            document.getElementById('durationValue').textContent = settings.testDuration;
        }
        if (settings.autoDarkMode !== undefined) document.getElementById('autoDarkMode').checked = settings.autoDarkMode;
        if (settings.animations !== undefined) document.getElementById('animations').checked = settings.animations;
        
        // Update duration value display
        document.getElementById('testDuration').addEventListener('input', (e) => {
            document.getElementById('durationValue').textContent = e.target.value;
        });
        
        // Save settings
        modal.querySelector('.btn-save-settings').addEventListener('click', () => {
            const newSettings = {
                downloadSize: parseInt(document.getElementById('downloadSize').value),
                uploadSize: parseInt(document.getElementById('uploadSize').value),
                testDuration: parseInt(document.getElementById('testDuration').value),
                autoDarkMode: document.getElementById('autoDarkMode').checked,
                animations: document.getElementById('animations').checked
            };
            
            localStorage.setItem('speedtest_settings', JSON.stringify(newSettings));
            
            // Update config
            this.config.downloadSize = newSettings.downloadSize;
            this.config.uploadSize = newSettings.uploadSize;
            this.config.testDuration = newSettings.testDuration * 1000;
            
            this.showNotification('Settings saved successfully!', 'success');
            
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        });
        
        // Reset settings
        modal.querySelector('.btn-reset-settings').addEventListener('click', () => {
            localStorage.removeItem('speedtest_settings');
            
            // Reset form
            document.getElementById('downloadSize').value = '26214400';
            document.getElementById('uploadSize').value = '26214400';
            document.getElementById('testDuration').value = '10';
            document.getElementById('durationValue').textContent = '10';
            document.getElementById('autoDarkMode').checked = true;
            document.getElementById('animations').checked = true;
            
            this.showNotification('Settings reset to defaults', 'info');
        });
        
        // Close handlers
        modal.querySelector('.btn-close-modal').addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.parentNode.removeChild(modal);
                    }
                }, 300);
            }
        });
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(() => {
                console.log('Service Worker registered');
            }).catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.speedTest = new SpeedTest();
    
    // Add notification styles
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            color: #333;
            padding: 15px 20px;
            border-radius: var(--border-radius);
            box-shadow: var(--box-shadow-lg);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            transform: translateX(120%);
            transition: transform 0.3s ease;
            max-width: 350px;
        }
        
        .notification.show {
            transform: translateX(0);
        }
        
        .notification-hide {
            transform: translateX(120%) !important;
        }
        
        .notification-success {
            background: linear-gradient(135deg, #56ab2f, #a8e063);
            color: white;
        }
        
        .notification-error {
            background: linear-gradient(135deg, #ff416c, #ff4b2b);
            color: white;
        }
        
        .notification-info {
            background: linear-gradient(135deg, #4cc9f0, #4361ee);
            color: white;
        }
        
        .notification i {
            font-size: 20px;
        }
        
        .notification-close {
            background: none;
            border: none;
            color: inherit;
            font-size: 24px;
            cursor: pointer;
            margin-left: auto;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        
        .notification-close:hover {
            opacity: 1;
        }
        
        .server-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px;
            border-bottom: 1px solid var(--gray-200);
            transition: var(--transition);
        }
        
        body.dark-mode .server-item {
            border-bottom-color: var(--gray-700);
        }
        
        .server-item:hover {
            background: var(--gray-100);
        }
        
        body.dark-mode .server-item:hover {
            background: var(--gray-800);
        }
        
        .server-item-main {
            display: flex;
            align-items: center;
            gap: 15px;
            flex: 1;
        }
        
        .server-item-icon {
            width: 40px;
            height: 40px;
            background: rgba(67, 97, 238, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .server-item-icon i {
            color: var(--primary-color);
            font-size: 18px;
        }
        
        .server-item-info {
            flex: 1;
        }
        
        .server-item-name {
            font-weight: 600;
            font-size: 16px;
            color: var(--dark-color);
        }
        
        body.dark-mode .server-item-name {
            color: var(--light-color);
        }
        
        .server-item-location {
            font-size: 14px;
            color: var(--gray-600);
        }
        
        body.dark-mode .server-item-location {
            color: var(--gray-400);
        }
        
        .server-item-stats {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 5px;
            margin: 0 20px;
        }
        
        .server-item-latency {
            font-weight: 600;
            color: var(--primary-color);
        }
        
        .server-item-distance {
            font-size: 12px;
            color: var(--gray-500);
        }
        
        .server-item-select {
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
            cursor: pointer;
            transition: var(--transition);
        }
        
        .server-item-select:hover:not(:disabled) {
            background: var(--primary-dark);
            transform: translateY(-2px);
        }
        
        .server-item-select:disabled {
            cursor: not-allowed;
            opacity: 0.7;
        }
        
        .history-item {
            background: var(--gray-100);
            border-radius: var(--border-radius);
            padding: 15px;
            margin-bottom: 10px;
        }
        
        body.dark-mode .history-item {
            background: var(--gray-800);
        }
        
        .history-item-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--gray-300);
        }
        
        body.dark-mode .history-item-header {
            border-bottom-color: var(--gray-600);
        }
        
        .history-item-id {
            font-weight: 600;
            color: var(--primary-color);
        }
        
        .history-item-date {
            font-size: 12px;
            color: var(--gray-600);
        }
        
        body.dark-mode .history-item-date {
            color: var(--gray-400);
        }
        
        .history-item-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }
        
        .history-stat {
            text-align: center;
        }
        
        .history-stat-label {
            display: block;
            font-size: 12px;
            color: var(--gray-600);
            margin-bottom: 5px;
        }
        
        body.dark-mode .history-stat-label {
            color: var(--gray-400);
        }
        
        .history-stat-value {
            font-weight: 700;
            font-size: 18px;
            color: var(--dark-color);
        }
        
        body.dark-mode .history-stat-value {
            color: var(--light-color);
        }
        
        .settings-group {
            margin-bottom: 25px;
        }
        
        .settings-group h3 {
            font-size: 16px;
            margin-bottom: 15px;
            color: var(--dark-color);
            padding-bottom: 10px;
            border-bottom: 1px solid var(--gray-200);
        }
        
        body.dark-mode .settings-group h3 {
            color: var(--light-color);
            border-bottom-color: var(--gray-700);
        }
        
        .setting-item {
            margin-bottom: 15px;
        }
        
        .setting-item label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--dark-color);
        }
        
        body.dark-mode .setting-item label {
            color: var(--light-color);
        }
        
        .setting-item select,
        .setting-item input[type="range"] {
            width: 100%;
            padding: 10px;
            border: 1px solid var(--gray-300);
            border-radius: var(--border-radius);
            background: white;
            color: var(--dark-color);
        }
        
        body.dark-mode .setting-item select,
        body.dark-mode .setting-item input[type="range"] {
            background: var(--gray-800);
            border-color: var(--gray-600);
            color: var(--light-color);
        }
        
        .setting-item input[type="range"] {
            padding: 0;
        }
        
        .setting-item label input[type="checkbox"] {
            margin-right: 10px;
        }
        
        .settings-actions {
            display: flex;
            gap: 15px;
            margin-top: 30px;
        }
        
        .btn-save-settings,
        .btn-reset-settings {
            flex: 1;
            padding: 12px;
            border-radius: var(--border-radius);
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition);
        }
        
        .btn-save-settings {
            background: var(--primary-color);
            color: white;
            border: none;
        }
        
        .btn-save-settings:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
        }
        
        .btn-reset-settings {
            background: var(--gray-200);
            color: var(--gray-700);
            border: 1px solid var(--gray-300);
        }
        
        body.dark-mode .btn-reset-settings {
            background: var(--gray-700);
            border-color: var(--gray-600);
            color: var(--gray-300);
        }
        
        .btn-reset-settings:hover {
            background: var(--gray-300);
        }
        
        body.dark-mode .btn-reset-settings:hover {
            background: var(--gray-600);
        }
    `;
    
    document.head.appendChild(style);
});
