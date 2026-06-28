const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResult = document.getElementById('searchResult');
const favList = document.getElementById('favouritesList');
const chartSection = document.getElementById('chartSection');
const chartTitle = document.getElementById('chartTitle');
const closeChart = document.getElementById('closeChart');
const priceChart = document.getElementById('priceChart');
const lastUpdatedEl = document.getElementById('lastUpdated');
const refreshBtn = document.getElementById('refreshBtn');

let favourites = [];
let currentChart = null;

document.addEventListener('DOMContentLoaded', () => {
  loadFavourites();

  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  closeChart.addEventListener('click', () => {
    chartSection.classList.add('hidden');
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.textContent = '⟳';
    refreshBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'REFRESH_NOW' }, () => {
      setTimeout(() => {
        renderFavouritesFromCache();
        refreshBtn.textContent = '↺';
        refreshBtn.disabled = false;
      }, 2000);
    });
  });

  updateLastUpdatedLabel();
});

async function fetchStock(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=7d';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Stock not found');
  const json = await res.json();
  const result = json.chart.result[0];
  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const times = result.timestamp;

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;
  const name = meta.longName || meta.shortName || symbol;
  const currency = meta.currency;

  const labels = times.map((ts) =>
    new Date(ts * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  );
  const prices = quotes.close.map((p) => p ? parseFloat(p.toFixed(2)) : null);

  return { symbol, name, price, change, changePct, currency, labels, prices };
}

async function handleSearch() {
  const symbol = searchInput.value.trim().toUpperCase();
  if (!symbol) return;
  searchResult.innerHTML = `<div class="loading">⏳ Fetching ${symbol}…</div>`;
  try {
    const stock = await fetchStock(symbol);
    renderStockCard(stock);
  } catch (err) {
    searchResult.innerHTML = `<div class="loading" style="color:#f85149;">❌ ${err.message}</div>`;
  }
}

function renderStockCard(stock) {
  const up = stock.change >= 0;
  const sym = stock.currency === 'INR' ? '₹' : '$';
  const isFav = favourites.includes(stock.symbol);

  searchResult.innerHTML = `
    <div class="stock-card">
      <div class="stock-row">
        <div>
          <div class="stock-symbol">${stock.symbol}</div>
          <div class="stock-name">${stock.name}</div>
        </div>
        <div>
          <div class="stock-price">${sym}${stock.price.toFixed(2)}</div>
          <div class="stock-change ${up ? 'up' : 'down'}">
            ${up ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePct).toFixed(2)}%)
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-small" id="favBtn">${isFav ? '⭐ Saved' : '☆ Save'}</button>
        <button class="btn-small" id="chartBtn">📊 Chart</button>
      </div>
    </div>`;

  document.getElementById('favBtn').addEventListener('click', () => {
    toggleFavourite(stock.symbol);
    renderStockCard(stock);
  });
  document.getElementById('chartBtn').addEventListener('click', () => {
    showChart(stock);
  });
}

function loadFavourites() {
  chrome.storage.local.get('favourites', (data) => {
    favourites = data.favourites || [];
    renderFavouritesFromCache();
  });
}

function toggleFavourite(symbol) {
  if (favourites.includes(symbol)) {
    favourites = favourites.filter((s) => s !== symbol);
  } else {
    favourites.push(symbol);
  }
  chrome.storage.local.set({ favourites });
  renderFavouritesFromCache();
}

function renderFavouritesFromCache() {
  if (favourites.length === 0) {
    favList.innerHTML = `<div class="empty-msg">No favourites yet. Search and save a stock!</div>`;
    return;
  }

  chrome.storage.local.get(['stockCache', 'cacheTimestamp'], async (data) => {
    const cache = data.stockCache || {};
    const missing = favourites.filter((s) => !cache[s]);

    if (missing.length > 0) {
      favList.innerHTML = `<div class="loading">⏳ Loading ${missing.join(', ')}…</div>`;
      const fetched = await Promise.allSettled(missing.map(fetchStock));
      fetched.forEach((r) => {
        if (r.status === 'fulfilled') cache[r.value.symbol] = r.value;
      });
      chrome.storage.local.set({ stockCache: cache, cacheTimestamp: Date.now() });
    }

    updateLastUpdatedLabel(data.cacheTimestamp);
    renderFavouriteCards(cache);
  });
}

function renderFavouriteCards(cache) {
  favList.innerHTML = '';
  favourites.forEach((symbol, i) => {
    const stock = cache[symbol];
    if (!stock) return;

    const up = stock.change >= 0;
    const sym = stock.currency === 'INR' ? '₹' : '$';
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-row">
        <div>
          <div class="stock-symbol">${stock.symbol}</div>
          <div class="stock-name">${stock.name}</div>
        </div>
        <div>
          <div class="stock-price">${sym}${stock.price.toFixed(2)}</div>
          <div class="stock-change ${up ? 'up' : 'down'}">
            ${up ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePct).toFixed(2)}%)
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-small" style="color:#f85149" data-sym="${stock.symbol}">🗑 Remove</button>
        <button class="btn-small" data-chart="${i}">📊 Chart</button>
      </div>`;

    card.querySelector('[data-sym]').addEventListener('click', (e) => {
      toggleFavourite(e.target.dataset.sym);
    });
    card.querySelector('[data-chart]').addEventListener('click', () => {
      showChart(stock);
    });

    favList.appendChild(card);
  });
}

function updateLastUpdatedLabel(timestamp) {
  if (!lastUpdatedEl) return;
  if (!timestamp) { lastUpdatedEl.textContent = ''; return; }
  const mins = Math.round((Date.now() - timestamp) / 60000);
  if (mins < 1) lastUpdatedEl.textContent = 'Updated just now';
  else if (mins === 1) lastUpdatedEl.textContent = 'Updated 1 min ago';
  else if (mins < 60) lastUpdatedEl.textContent = `Updated ${mins} mins ago`;
  else lastUpdatedEl.textContent = `Updated ${Math.floor(mins / 60)}h ago`;
}

function showChart(stock) {
  chartSection.classList.remove('hidden');
  chartTitle.textContent = `${stock.symbol} — Last 7 Days`;
  if (currentChart) currentChart.destroy();
  const color = stock.change >= 0 ? '#3fb950' : '#f85149';

  currentChart = new Chart(priceChart, {
    type: 'line',
    data: {
      labels: stock.labels,
      datasets: [{
        data: stock.prices,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
      },
    },
  });
}