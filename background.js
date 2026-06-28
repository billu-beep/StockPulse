const ALARM_NAME = 'stockpulse-refresh';
const REFRESH_INTERVAL_MINUTES = 15;

// Called once on install / browser startup
chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  refreshFavourites();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  refreshFavourites();
});

// Alarm fires every 15 minutes
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshFavourites();
  }
});

function scheduleAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: REFRESH_INTERVAL_MINUTES,
        periodInMinutes: REFRESH_INTERVAL_MINUTES,
      });
    }
  });
}

async function fetchStock(symbol) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    symbol +
    '?interval=1d&range=7d';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed for ' + symbol);
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
    new Date(ts * 1000).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    })
  );
  const prices = quotes.close.map((p) =>
    p ? parseFloat(p.toFixed(2)) : null
  );

  return { symbol, name, price, change, changePct, currency, labels, prices };
}

async function refreshFavourites() {
  chrome.storage.local.get('favourites', async (data) => {
    const favourites = data.favourites || [];
    if (favourites.length === 0) return;

    const results = await Promise.allSettled(favourites.map(fetchStock));
    const cache = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        cache[r.value.symbol] = r.value;
      }
    });

    chrome.storage.local.set({
      stockCache: cache,
      cacheTimestamp: Date.now(),
    });
  });
}

// Allow popup to trigger an immediate refresh
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'REFRESH_NOW') {
    refreshFavourites().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
});
