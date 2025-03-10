import { getCryptoSignals, getCryptoHistoricalData, getCryptoFullHistoricalData } from './crypto-signals.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import annotationPlugin from 'chartjs-plugin-annotation';
Chart.register(annotationPlugin);

// Single initialization check
if (!window.__cryptoAppInitialized) {
    window.__cryptoAppInitialized = true;

    const API_BASE_URL = 'https://api.coingecko.com/api/v3';

    // Initialize charts object to store references
    window.chartInstances = {};

    async function fetchTopCryptos() {
        try {
            const response = await fetch(`${API_BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const cryptos = await response.json();
            return cryptos.map(crypto => ({
                id: crypto.id,
                symbol: crypto.symbol.toUpperCase(),
                name: crypto.name,
                price: crypto.current_price,
                priceChange24h: crypto.price_change_percentage_24h || 0,
                marketCap: crypto.market_cap || 0
            }));
        } catch (error) {
            console.error('Error fetching top cryptos:', error);
            return getOfflineCryptoData();
        }
    }

    function renderTopCryptos(cryptos) {
        const container = document.getElementById('topCryptosContainer');
        container.innerHTML = cryptos.map(crypto => `
            <div class="col-12 mb-2">
                <div class="crypto-card p-3 d-flex justify-content-between align-items-center" data-symbol="${crypto.symbol}">
                    <div class="d-flex align-items-center">
                        <div class="me-2">
                            <div class="indicator-dot" style="background-color: ${crypto.priceChange24h > 0 ? '#00ff00' : '#ff0000'}"></div>
                        </div>
                        <div>
                            <h5 class="mb-1">${crypto.name} <small class="text-muted">${crypto.symbol}</small></h5>
                            <small class="text-muted">Vol: $${formatNumber(crypto.marketCap)}</small>
                        </div>
                    </div>
                    <div class="text-end">
                        <h6 class="mb-1">$${crypto.price.toFixed(crypto.price < 1 ? 6 : crypto.price < 10 ? 4 : 2)}</h6>
                        <small class="${crypto.priceChange24h > 0 ? 'text-success' : 'text-danger'}">
                            ${crypto.priceChange24h > 0 ? '▲' : '▼'} ${Math.abs(crypto.priceChange24h).toFixed(2)}%
                        </small>
                    </div>
                </div>
            </div>
        `).join('');

        // Add chart modal trigger
        document.querySelectorAll('.crypto-card').forEach(card => {
            card.addEventListener('click', async () => {
                const symbol = card.dataset.symbol;
                await showCryptoChart(symbol);
            });
        });
    }

    async function showCryptoChart(symbol, isPremium = false) {
        try {
            const fullData = await getCryptoFullHistoricalData(symbol.toLowerCase());
            
            const chartCtx = document.getElementById('cryptoChart');
            const cryptoChartTitle = document.getElementById('cryptoChartTitle');
            cryptoChartTitle.textContent = `${symbol} ${isPremium ? 'Premium ' : ''}Analysis`;

            // Destroy existing chart instance if it exists
            if (window.chartInstances[symbol]) {
                window.chartInstances[symbol].destroy();
            }

            // Create new chart instance with proper scale registration
            window.chartInstances[symbol] = new Chart(chartCtx, {
                type: 'line',
                data: {
                    labels: Array(fullData.prices.length).fill(0).map((_, i) => i),
                    datasets: [
                        {
                            label: 'Price',
                            data: fullData.prices,
                            borderColor: '#00ff00',
                            backgroundColor: 'rgba(0, 255, 0, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0,
                            borderWidth: 2,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Volume',
                            data: fullData.volumes,
                            type: 'bar',
                            backgroundColor: 'rgba(0, 255, 0, 0.2)',
                            yAxisID: 'y2'
                        },
                        {
                            label: 'EMA 20',
                            data: calculateEMA(fullData.prices, 20),
                            borderColor: '#ff9900',
                            borderDash: [5, 5],
                            pointRadius: 0,
                            borderWidth: 1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'SMA 50',
                            data: calculateSMA(fullData.prices, 50),
                            borderColor: '#ff0000',
                            borderDash: [2, 2],
                            pointRadius: 0,
                            borderWidth: 1,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            display: true,
                            grid: { display: false },
                            ticks: { 
                                color: '#00ff00',
                                maxTicksLimit: 8
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: {
                                color: 'rgba(0,255,0,0.1)',
                            },
                            ticks: { 
                                color: '#00ff00',
                                callback: value => '$' + value.toFixed(isPremium ? 6 : 2)
                            }
                        },
                        y2: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            ticks: {
                                color: '#00ff00',
                                callback: value => formatNumber(value)
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { 
                                color: '#00ff00',
                                font: { weight: 'bold' }
                            }
                        },
                        annotation: {
                            annotations: generateChartAnnotations(fullData, isPremium)
                        }
                    }
                }
            });

            // Show the modal
            const chartModal = new bootstrap.Modal(document.getElementById('cryptoChartModal'));
            chartModal.show();

        } catch (error) {
            console.error('Error showing crypto chart:', error);
            alert('Error loading chart data. Please try again.');
        }
    }

    function generateChartAnnotations(data, isPremium) {
        const annotations = {};
        
        if (isPremium) {
            const prices = data.prices;
            const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
            
            annotations.supportZone = {
                type: 'box',
                yMin: Math.min(...prices),
                yMax: avg * 0.95,
                backgroundColor: 'rgba(0, 255, 0, 0.1)',
                borderColor: 'rgba(0, 255, 0, 0.3)',
                borderWidth: 1,
                label: {
                    content: 'Support Zone',
                    display: true
                }
            };
            
            annotations.resistanceZone = {
                type: 'box',
                yMin: avg * 1.05,
                yMax: Math.max(...prices),
                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                borderColor: 'rgba(255, 0, 0, 0.3)',
                borderWidth: 1,
                label: {
                    content: 'Resistance Zone',
                    display: true
                }
            };
        }
        
        return annotations;
    }

    function renderCryptoSignals(signals) {
        const container = document.getElementById('cryptoSignalsContainer');
        container.innerHTML = signals.map(signal => `
            <div class="crypto-card p-3 mb-3 position-relative">
                ${signal.isPremium ? '<span class="premium-tag">PREMIUM</span>' : ''}
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <h5 class="mb-0 d-flex align-items-center">
                            ${signal.pair}
                            <span class="signal-badge ms-2 ${
                                signal.signalType === 'BUY' ? 'bg-success' : 
                                signal.signalType === 'SELL' ? 'bg-danger' : 'bg-secondary text-white'
                            }">${signal.signalType}</span>
                        </h5>
                        <small class="text-muted">${signal.pattern}</small>
                    </div>
                    <div class="text-end">
                        <div class="confidence-indicator">
                            <small class="text-muted">Confidence</small>
                            <div class="progress" style="height: 6px; width: 80px;">
                                <div class="progress-bar bg-success" style="width: ${signal.confidence}%"></div>
                            </div>
                            <small class="text-success">${signal.confidence}%</small>
                        </div>
                    </div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-4">
                        <small class="text-muted d-block">Entry Price</small>
                        <p class="mb-0">$${signal.entryPrice}</p>
                    </div>
                    <div class="col-4">
                        <small class="text-muted d-block">Target</small>
                        <p class="mb-0 text-success">$${signal.targetPrice}</p>
                    </div>
                    <div class="col-4">
                        <small class="text-muted d-block">Stop Loss</small>
                        <p class="mb-0 text-danger">$${signal.stopLoss}</p>
                    </div>
                </div>
                
                <div class="indicator-row d-flex justify-content-between mb-2">
                    <div class="indicator-item">
                        <small class="text-muted">Risk/Reward</small>
                        <p class="mb-0">${signal.riskReward}</p>
                    </div>
                    <div class="indicator-item">
                        <small class="text-muted">Potential Gain</small>
                        <p class="mb-0 text-success">+${signal.potentialGain}%</p>
                    </div>
                </div>
                
                <div class="technical-indicators mb-2">
                    <div class="chip">RSI: ${signal.indicators.rsi}</div>
                    <div class="chip">MACD: ${signal.indicators.macd}</div>
                    <div class="chip">Trend: ${signal.indicators.trend}</div>
                </div>
                
                <div class="ai-prediction">
                    <i class="fas fa-robot me-1"></i> ${signal.aiPrediction}
                </div>
            </div>
        `).join('');
    }

    async function renderCryptoCharts(signals) {
        const container = document.getElementById('portfolioSection');
        container.innerHTML = signals.slice(0, 10).map(signal => `
            <div class="crypto-chart-card p-3 mb-4">
                <div class="chart-header">
                    <div>
                        <h5 class="mb-0">${signal.pair} <span class="signal-badge ${
                            signal.signalType === 'BUY' ? 'bg-success text-white' : 
                            signal.signalType === 'SELL' ? 'bg-danger text-white' : 'bg-secondary text-white'
                        }">${signal.signalType}</span></h5>
                        <small class="text-muted">${signal.pattern} Pattern</small>
                    </div>
                    <div class="text-end">
                        <span class="indicator-value ${parseFloat(signal.priceChange24h) > 0 ? 'text-success' : 'text-danger'}">
                            ${parseFloat(signal.priceChange24h) > 0 ? '▲' : '▼'} ${Math.abs(parseFloat(signal.priceChange24h))}%
                        </span>
                    </div>
                </div>
                
                <div class="position-relative">
                    <canvas id="chart-${signal.id}" class="crypto-full-chart"></canvas>
                    <div class="position-absolute" style="top: 10px; right: 10px; background: rgba(0,0,0,0.7); padding: 5px; border-radius: 5px;">
                        <div class="d-flex align-items-center mb-1">
                            <div class="indicator-dot" style="background-color: #00ff00;"></div>
                            <small class="ms-1">Price</small>
                        </div>
                        <div class="d-flex align-items-center mb-1">
                            <div class="indicator-dot" style="background-color: #ff9900;"></div>
                            <small class="ms-1">EMA 50</small>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="indicator-dot" style="background-color: #ff0000;"></div>
                            <small class="ms-1">SMA 20</small>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-3">
                    <div class="col-3">
                        <small class="text-muted d-block">Entry</small>
                        <p class="mb-0">$${signal.entryPrice}</p>
                    </div>
                    <div class="col-3">
                        <small class="text-muted d-block">Target</small>
                        <p class="mb-0 text-success">$${signal.targetPrice}</p>
                    </div>
                    <div class="col-3">
                        <small class="text-muted d-block">Support</small>
                        <p class="mb-0 text-info">$${signal.support}</p>
                        <small class="d-block text-muted" style="font-size: 0.7rem;">Strength: ${signal.supportStrength}%</small>
                    </div>
                    <div class="col-3">
                        <small class="text-muted d-block">Resistance</small>
                        <p class="mb-0 text-warning">$${signal.resistance}</p>
                        <small class="d-block text-muted" style="font-size: 0.7rem;">Strength: ${signal.resistanceStrength}%</small>
                    </div>
                </div>
                
                <div class="ai-prediction mt-2">
                    <i class="fas fa-brain me-1"></i> ${signal.aiPrediction}
                </div>
            </div>
        `).join('');

        // Render advanced charts for each signal
        signals.slice(0, 10).forEach(async (signal) => {
            const chartCtx = document.getElementById(`chart-${signal.id}`);
            const fullData = await getCryptoFullHistoricalData(signal.id, 90);
            
            if (fullData && chartCtx) {
                const entryPrice = parseFloat(signal.entryPrice);
                const targetPrice = parseFloat(signal.targetPrice);
                const stopLoss = parseFloat(signal.stopLoss);
                const support = parseFloat(signal.support);
                const resistance = parseFloat(signal.resistance);
                
                const chart = new Chart(chartCtx, {
                    type: 'line',
                    data: {
                        labels: fullData.prices.map((_, i) => i),
                        datasets: [
                            {
                                label: 'Price',
                                data: fullData.prices,
                                borderColor: 'rgb(0, 255, 0)',
                                backgroundColor: 'rgba(0, 255, 0, 0.1)',
                                fill: true,
                                tension: 0.3,
                                borderWidth: 2,
                                pointRadius: 0
                            },
                            {
                                label: 'SMA 20',
                                data: fullData.indicators.sma20,
                                borderColor: 'rgb(255, 99, 132)',
                                borderDash: [5, 5],
                                tension: 0.3,
                                borderWidth: 1.5,
                                pointRadius: 0
                            },
                            {
                                label: 'EMA 50',
                                data: fullData.indicators.ema50,
                                borderColor: 'rgb(255, 159, 64)',
                                borderDash: [2, 2],
                                tension: 0.3,
                                borderWidth: 1.5,
                                pointRadius: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        scales: {
                            y: {
                                beginAtZero: false,
                                grid: {
                                    color: 'rgba(0,255,0,0.1)',
                                    borderColor: 'rgba(0,255,0,0.2)',
                                },
                                ticks: { 
                                    color: '#00ff00',
                                    callback: function(value) {
                                        return '$' + value.toFixed(2);
                                    },
                                    maxTicksLimit: 6
                                }
                            },
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: { 
                                    color: '#00ff00',
                                    maxTicksLimit: 6,
                                    display: true
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            annotation: {
                                annotations: {
                                    entryLine: {
                                        type: 'line',
                                        yMin: entryPrice,
                                        yMax: entryPrice,
                                        borderColor: '#ffffff',
                                        borderWidth: 1,
                                        borderDash: [2, 2],
                                        label: {
                                            content: 'Entry',
                                            display: true,
                                            backgroundColor: 'rgba(0,0,0,0.7)',
                                            color: '#ffffff',
                                            position: 'start'
                                        }
                                    },
                                    targetLine: {
                                        type: 'line',
                                        yMin: targetPrice,
                                        yMax: targetPrice,
                                        borderColor: '#00ff00',
                                        borderWidth: 1,
                                        borderDash: [2, 2]
                                    },
                                    stopLossLine: {
                                        type: 'line',
                                        yMin: stopLoss,
                                        yMax: stopLoss,
                                        borderColor: '#ff0000',
                                        borderWidth: 1,
                                        borderDash: [2, 2]
                                    },
                                    supportLine: {
                                        type: 'line',
                                        yMin: support,
                                        yMax: support,
                                        borderColor: 'rgba(0, 255, 255, 0.5)',
                                        borderWidth: 1,
                                        borderDash: [5, 5]
                                    },
                                    resistanceLine: {
                                        type: 'line',
                                        yMin: resistance,
                                        yMax: resistance,
                                        borderColor: 'rgba(255, 165, 0, 0.5)',
                                        borderWidth: 1,
                                        borderDash: [5, 5]
                                    }
                                }
                            }
                        }
                    }
                });
            }
        });
    }

    // Helper function to format large numbers
    function formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + 'B';
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(2) + 'K';
        }
        return num.toString();
    }

    function setupBottomNavigation() {
        const navItems = document.querySelectorAll('.bottom-nav .nav-item');
        const sections = {
            marketOverview: document.getElementById('marketOverviewSection'),
            signals: document.getElementById('signalsSection'),
            portfolio: document.getElementById('portfolioSection')
        };

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(navItem => navItem.classList.remove('active'));
                item.classList.add('active');

                Object.values(sections).forEach(section => section.classList.add('d-none'));

                const sectionId = item.dataset.section;
                sections[sectionId].classList.remove('d-none');
            });
        });
    }

    function getOfflineCryptoData() {
        // Fallback data when API fails
        return [
            { id: "bitcoin", symbol: "BTC", name: "Bitcoin", price: 69420, priceChange24h: 2.5, marketCap: 1300000000000 },
            { id: "ethereum", symbol: "ETH", name: "Ethereum", price: 3500, priceChange24h: 1.8, marketCap: 420000000000 },
            { id: "ripple", symbol: "XRP", name: "XRP", price: 0.55, priceChange24h: -0.9, marketCap: 28000000000 },
            { id: "cardano", symbol: "ADA", name: "Cardano", price: 0.45, priceChange24h: 3.2, marketCap: 16000000000 },
            { id: "solana", symbol: "SOL", name: "Solana", price: 142, priceChange24h: 5.7, marketCap: 62000000000 },
            { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", price: 0.14, priceChange24h: -1.3, marketCap: 19000000000 },
            { id: "polkadot", symbol: "DOT", name: "Polkadot", price: 6.8, priceChange24h: 0.5, marketCap: 8400000000 },
            { id: "digibyte", symbol: "DGB", name: "DigiByte", price: 0.0089, priceChange24h: 7.4, marketCap: 149000000 }
        ];
    }

    function getOfflineSignalData() {
        return [
            {
                id: "bitcoin",
                pair: "BTC/USDT",
                name: "Bitcoin",
                signalType: "BUY",
                pattern: "Bullish Breakout",
                entryPrice: "69420",
                targetPrice: "75000",
                stopLoss: "65000",
                support: "68500",
                resistance: "71200",
                supportStrength: 85,
                resistanceStrength: 75,
                potentialGain: "8.04",
                riskReward: "1:1.26",
                confidence: 88,
                priceChange24h: "2.50",
                volume24h: 28000000000,
                marketCap: 1300000000000,
                indicators: { rsi: 62, macd: "Bullish", trend: "Bullish" },
                aiPrediction: "Strong buy opportunity with high confidence level. Technical indicators suggest potential for significant upward movement.",
                volumeChange: "15.60",
                isPremium: true
            },
            {
                id: "ripple",
                pair: "XRP/USDT",
                name: "Ripple",
                signalType: "BUY",
                pattern: "Double Bottom",
                entryPrice: "0.55",
                targetPrice: "0.68",
                stopLoss: "0.49",
                support: "0.52",
                resistance: "0.61",
                supportStrength: 79,
                resistanceStrength: 66,
                potentialGain: "23.64",
                riskReward: "1:2.16",
                confidence: 77,
                priceChange24h: "-0.90",
                volume24h: 980000000,
                marketCap: 28000000000,
                indicators: { rsi: 49, macd: "Neutral", trend: "Neutral" },
                aiPrediction: "Potential buy opportunity at support level. Current consolidation phase might lead to upward breakout.",
                volumeChange: "5.80",
                isPremium: true
            },
            {
                id: "polkadot",
                pair: "DOT/USDT",
                name: "Polkadot",
                signalType: "BUY",
                pattern: "Cup and Handle",
                entryPrice: "6.80",
                targetPrice: "8.40",
                stopLoss: "6.10",
                support: "6.50",
                resistance: "7.20",
                supportStrength: 73,
                resistanceStrength: 62,
                potentialGain: "23.53",
                riskReward: "1:2.29",
                confidence: 75,
                priceChange24h: "0.50",
                volume24h: 410000000,
                marketCap: 8400000000,
                indicators: { rsi: 54, macd: "Bullish", trend: "Neutral" },
                aiPrediction: "Buy signal with favorable risk-reward ratio. Pattern formation suggests potential for extended upward movement.",
                volumeChange: "9.20",
                isPremium: false
            },
            {
                id: "dogecoin",
                pair: "DOGE/USDT",
                name: "Dogecoin",
                signalType: "SELL",
                pattern: "Rising Wedge",
                entryPrice: "0.14",
                targetPrice: "0.11",
                stopLoss: "0.16",
                support: "0.13",
                resistance: "0.15",
                supportStrength: 65,
                resistanceStrength: 81,
                potentialGain: "21.43",
                riskReward: "1:1.5",
                confidence: 73,
                priceChange24h: "-1.30",
                volume24h: 820000000,
                marketCap: 19000000000,
                indicators: { rsi: 67, macd: "Bearish", trend: "Bearish" },
                aiPrediction: "Sell signal as price approaches resistance zone. Technical pattern suggests potential reversal.",
                volumeChange: "-4.60",
                isPremium: false
            },
            {
                id: "ethereum",
                pair: "ETH/USDT",
                name: "Ethereum",
                signalType: "BUY",
                pattern: "Accumulation",
                entryPrice: "3500",
                targetPrice: "3950",
                stopLoss: "3250",
                support: "3400",
                resistance: "3700",
                supportStrength: 78,
                resistanceStrength: 65,
                potentialGain: "12.86",
                riskReward: "1:1.8",
                confidence: 82,
                priceChange24h: "1.80",
                volume24h: 15000000000,
                marketCap: 420000000000,
                indicators: { rsi: 58, macd: "Bullish", trend: "Bullish" },
                aiPrediction: "Strong buy opportunity ahead of network upgrade. Technical analysis indicates increased adoption and demand.",
                volumeChange: "8.30",
                isPremium: true
            },
            {
                id: "digibyte",
                pair: "DGB/USDT",
                name: "DigiByte",
                signalType: "BUY",
                pattern: "Oversold Bounce",
                entryPrice: "0.0089",
                targetPrice: "0.0125",
                stopLoss: "0.0075",
                support: "0.0081",
                resistance: "0.0098",
                supportStrength: 72,
                resistanceStrength: 68,
                potentialGain: "40.45",
                riskReward: "1:2.57",
                confidence: 76,
                priceChange24h: "7.40",
                volume24h: 5900000,
                marketCap: 149000000,
                indicators: { rsi: 42, macd: "Bullish", trend: "Neutral" },
                aiPrediction: "Potential breakout from accumulation zone. RSI indicates oversold conditions.",
                volumeChange: "22.10",
                isPremium: false
            },
            {
                id: "solana",
                pair: "SOL/USDT",
                name: "Solana",
                signalType: "BUY",
                pattern: "Momentum",
                entryPrice: "142",
                targetPrice: "168",
                stopLoss: "130",
                support: "138",
                resistance: "150",
                supportStrength: 81,
                resistanceStrength: 70,
                potentialGain: "18.31",
                riskReward: "1:2.17",
                confidence: 86,
                priceChange24h: "5.70",
                volume24h: 3200000000,
                marketCap: 62000000000,
                indicators: { rsi: 68, macd: "Bullish", trend: "Bullish" },
                aiPrediction: "Strong buy with increasing ecosystem adoption. Technical indicators very favorable.",
                volumeChange: "19.40",
                isPremium: true
            },
            {
                id: "cardano",
                pair: "ADA/USDT",
                name: "Cardano",
                signalType: "BUY",
                pattern: "Rounding Bottom",
                entryPrice: "0.45",
                targetPrice: "0.54",
                stopLoss: "0.41",
                support: "0.435",
                resistance: "0.48",
                supportStrength: 75,
                resistanceStrength: 63,
                potentialGain: "20.00",
                riskReward: "1:2.25",
                confidence: 73,
                priceChange24h: "3.20",
                volume24h: 650000000,
                marketCap: 16000000000,
                indicators: { rsi: 55, macd: "Bullish", trend: "Neutral" },
                aiPrediction: "Favorable entry point detected with moderate confidence. Bullish momentum building.",
                volumeChange: "11.80",
                isPremium: false
            }
        ];
    }

    function calculateEMA(data, days) {
        let ema = [];
        let k = 2 / (days + 1);
        ema[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            ema[i] = data[i] * k + ema[i - 1] * (1 - k);
        }
        return ema;
    }

    function calculateSMA(data, days) {
        let sma = [];
        for (let i = 0; i < data.length; i++) {
            if (i < days - 1) {
                sma[i] = null;
            } else {
                let sum = 0;
                for (let j = i - days + 1; j <= i; j++) {
                    sum += data[j];
                }
                sma[i] = sum / days;
            }
        }
        return sma;
    }

    // Improve initialization to handle errors better
    async function initializeApp() {
        try {
            const loadingOverlay = document.getElementById('loadingOverlay');
            loadingOverlay.style.display = 'flex';
            
            // Load offline data first for immediate display
            const offlineData = {
                topCryptos: getOfflineCryptoData(),
                signals: getOfflineSignalData()
            };
            
            renderTopCryptos(offlineData.topCryptos);
            renderCryptoSignals(offlineData.signals);
            
            // Setup UI elements
            setupBottomNavigation();
            setupAdditionalEvents();
            
            // Try to load live data
            const [topCryptos, signals] = await Promise.all([
                fetchTopCryptos().catch(() => offlineData.topCryptos),
                getCryptoSignals().catch(() => offlineData.signals)
            ]);

            if (topCryptos?.length) renderTopCryptos(topCryptos);
            if (signals?.length) {
                renderCryptoSignals(signals);
                await renderCryptoCharts(signals);
            }

        } catch (error) {
            console.error('App initialization error:', error);
            document.getElementById('marketOverviewSection').innerHTML = 
                '<div class="alert alert-danger">Unable to load market data. Please check your connection and try again.</div>';
        } finally {
            setTimeout(() => {
                document.getElementById('loadingOverlay').style.display = 'none';
            }, 1000);
        }
    }

    function setupAdditionalEvents() {
        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            alert('Settings and preferences will be available in the next update!');
        });
        
        // Handle premium signal clicks
        document.addEventListener('click', function(e) {
            if (e.target.closest('.premium-signal-card')) {
                const premiumModal = new bootstrap.Modal(document.getElementById('cryptoChartModal'));
                document.getElementById('cryptoChartTitle').textContent = 'DGB/USDT Premium Analysis';
                
                // If chart exists, destroy it first
                if (window.chartInstances['DGB']) {
                    window.chartInstances['DGB'].destroy();
                }
                
                // Create a specialized chart for the premium signal
                const chartCtx = document.getElementById('cryptoChart');
                const offlineData = getOfflineSignalData().find(signal => signal.id === 'digibyte');
                
                if (offlineData) {
                    showCryptoChart('DGB', true);
                }
                
                premiumModal.show();
            }
        });
    }

    // Initialize the app
    document.addEventListener('DOMContentLoaded', initializeApp);
}
