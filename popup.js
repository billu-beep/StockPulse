const searchInput=document.getElementById('searchInput');
const searchBtn=document.getElementById('searchBtn');
const searchResult=document.getElementById('searchResult');
const favList=document.getElementById('favouritesList');
const chartSection=document.getElementById('chartSection');
const chartTitle=document.getElementById('chartTitle');
const closeChart=document.getElementById('closeChart');
const priceChart=document.getElementById('priceChart');

let favourites=[]
let currentChart=null

document.addEventListener('DOMContentLoaded',() =>{

    loadFavourites();

    searchBtn.addEventListener('click',handleSearch);
    searchInput.addEventListener('keydown',(e) =>{
        if(e.key=='Enter') handleSearch();
    });
    closeChart.addEventListener('click',() =>{
        chartSection.classList.add('hidden');
    });


});

async function fetchStock(symbol) {
   const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=7d';
    const res = await fetch(url);
    if(!res.ok) throw new Error('Stock not found');
   const json = await res.json();
   console.log("Yahoo Response:", json);
    const meta = json.chart.result[0].meta;
    const quotes = json.chart.result[0].indicators.quote[0];
    const times = json.chart.result[0].timestamp;

    const price=meta.regularMarketPrice;
    const prevClose= meta.chartPreviousClose;
    const change=price-prevClose;
    const changePct=(change/prevClose)*100;
    const name=meta.longName || meta.shortName || symbol;
    const currency=meta.currency;

    const labels = times.map(ts =>
    new Date(ts * 1000).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric'
    })
);
    const prices=quotes.close.map(p => p ? parseFloat(p.toFixed(2)) : null);
    return { symbol, name, price, change, changePct, currency, labels, prices};




    
}
async function handleSearch() {
    const symbol=searchInput.value.trim().toUpperCase();
    if (!symbol) return;

    searchResult.innerHTML=` <div class="loading">⏳ Fetching ${symbol}...</div>`;

    try{
        const stock= await fetchStock(symbol);
    renderStockCard(stock);
} catch(err) {
    console.error("FULL ERROR:", err);

    searchResult.innerHTML=`
     <div class="loading" style="color:#f85149;">
        ❌ Error: ${err.message}
      </div>`;
}
    
}
function renderStockCard(stock){
    const up=stock.change>=0;
    const symbol=stock.currency=== 'INR' ? '₹' : '$';
    const isFav=favourites.includes(stock.symbol);

    searchResult.innerHTML=`
    <div class="stock-card">
      <div class="stock-row">
        <div>
          <div class="stock-symbol">${stock.symbol}</div>
          <div class="stock-name">${stock.name}</div>
        </div>
        <div>
          <div class="stock-price">${symbol}${stock.price.toFixed(2)}</div>
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
    document.getElementById('favBtn').addEventListener('click',() =>{
        toggleFavourite(stock.symbol);
        renderStockCard(stock);
    });
    document.getElementById('chartBtn').addEventListener('click',() =>{
        showChart(stock);
    });

}

function showChart(stock){
    chartSection.classList.remove('hidden');
    chartTitle.textContent=`${stock.symbol} — Last 7 Days`;
    if (currentChart) currentChart.destroy();
    const color=stock.change >= 0 ? '#3fb950' : '#f85149';

    currentChart=new Chart(priceChart,{
        type:'line',
        data : {
             labels: stock.labels,
      datasets: [{
        data: stock.prices,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        borderWidth: 2,
      }]
    },
    options:{
        responsive:false,
        plugins:{ legend: { display: false } },
        scales:{
            x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
            y: {ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' }}
        }


    }


        

    });

}


function loadFavourites(){
    chrome.storage.local.get('favourites', (data) => {
        favourites=data.favourites || [];
        renderFavourites();
    });
}
function toggleFavourite(symbol){
    if(favourites.includes(symbol)){
        favourites=favourites.filter(s => s!==symbol);

    }
    else{
        favourites.push(symbol);
    }

    chrome.storage.local.set({favourites});
    renderFavourites();
}

async function renderFavourites() {
    if (favourites.length==0){
        favList.innerHTML=`<div class="empty-msg">No favourites yet. Search and save a stock!</div>`;
    return;
    }
    favList.innerHTML = `<div class="loading">Loading favourites...</div>`;
    const results=await Promise.allSettled(favourites.map(fetchStock));
    favList.innerHTML='';
    results.forEach((result,i) =>{
        if (result.status=='fulfilled'){
            const stock=result.value;
            const up=stock.change >=0;
            const symbol=stock.currency === 'INR' ? '₹' : '$';
            const card=document.createElement('div');
            card.className="stock-card";
            card.innerHTML=`
             <div class="stock-row">
          <div>
            <div class="stock-symbol">${stock.symbol}</div>
            <div class="stock-name">${stock.name}</div>
          </div>
          <div>
            <div class="stock-price">${symbol}${stock.price.toFixed(2)}</div>
            <div class="stock-change ${up ? 'up' : 'down'}">
              ${up ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePct).toFixed(2)}%)
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-small" style="color:#f85149" data-sym="${stock.symbol}">🗑 Remove</button>
          <button class="btn-small" data-chart="${i}">📊 Chart</button>
        </div>`;
        card.querySelector('[data-sym]').addEventListener('click',(e) =>{
            toggleFavourite(e.target.dataset.sym);

        });
        card.querySelector('[data-chart]').addEventListener('click', () => {
        showChart(stock);
      });

        favList.appendChild(card);

        }
    });
}






