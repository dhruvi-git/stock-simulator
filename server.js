const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SQLite Database Setup
const dbFile = path.join(__dirname, 'mock_stock.sqlite');
const db = new sqlite3.Database(dbFile);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game Constants
const STOCKS=['GOLD','NAT GAS','CRUDE OIL','BSNL','BANK OF BARODA','ATHER','WIPRO','CIPLA','JIO FIN','GODREJ PROP','MARICO'];
const PRICES={
  'GOLD':[10800,11210,11570,12340,12680],
  'NAT GAS':[295,254,270,321,425],
  'CRUDE OIL':[5200,5323,5370,5640,5590],
  'BSNL':[120,77,93,132,168],
  'BANK OF BARODA':[180,185,201,173,237],
  'ATHER':[460,492,620,583,368],
  'WIPRO':[270,263,310,287,220],
  'CIPLA':[1300,1354,1415,1522,1332],
  'JIO FIN':[230,242,279,303,263],
  'GODREJ PROP':[1170,936,1063,1102,1130],
  'MARICO':[620,592,658,644,636]
};
const ROUND_DUR=10*60*1000;
const START_CASH=1500000;
const ADMIN_PASS='piyush26';
const CANDLE_INTERVAL=30*1000;

// State (In memory, synced to DB)
let gameState = {
    round: 1,
    roundStart: null,
    gameStarted: false,
    news: '',
    oid: 0
};
let teams = {};
let orders = [];
let candleHistory = {};

// Load state from DB
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS GameState (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS Teams (name TEXT PRIMARY KEY, cash REAL, holdings TEXT, avgBuy TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS Orders (id INTEGER PRIMARY KEY, stock TEXT, seller TEXT, qty INTEGER, price REAL)`);
    db.run(`CREATE TABLE IF NOT EXISTS CandleHistory (key TEXT PRIMARY KEY, candles TEXT)`);
    
    // Attempt to load existing state
    db.all("SELECT * FROM GameState", [], (err, rows) => {
        if (rows) {
            rows.forEach(r => {
                if (r.key === 'state') gameState = JSON.parse(r.value);
            });
        }
    });
    db.all("SELECT * FROM Teams", [], (err, rows) => {
        if (rows) {
            rows.forEach(r => {
                teams[r.name] = {
                    cash: r.cash,
                    holdings: JSON.parse(r.holdings || '{}'),
                    avgBuy: JSON.parse(r.avgBuy || '{}')
                };
            });
        }
    });
    db.all("SELECT * FROM Orders", [], (err, rows) => {
        if (rows) orders = rows;
    });
    db.all("SELECT * FROM CandleHistory", [], (err, rows) => {
        if (rows) {
            rows.forEach(r => {
                candleHistory[r.key] = JSON.parse(r.candles);
            });
        }
    });
});

function saveStateToDB() {
    db.serialize(() => {
        const stmtGS = db.prepare(`INSERT OR REPLACE INTO GameState (key, value) VALUES (?, ?)`);
        stmtGS.run('state', JSON.stringify(gameState));
        stmtGS.finalize();
        
        const stmtTeam = db.prepare(`INSERT OR REPLACE INTO Teams (name, cash, holdings, avgBuy) VALUES (?, ?, ?, ?)`);
        Object.keys(teams).forEach(t => {
            stmtTeam.run(t, teams[t].cash, JSON.stringify(teams[t].holdings), JSON.stringify(teams[t].avgBuy));
        });
        stmtTeam.finalize();

        // Clear and insert orders
        db.run(`DELETE FROM Orders`, () => {
            const stmtOrder = db.prepare(`INSERT INTO Orders (id, stock, seller, qty, price) VALUES (?, ?, ?, ?, ?)`);
            orders.forEach(o => {
                stmtOrder.run(o.id, o.stock, o.seller, o.qty, o.price);
            });
            stmtOrder.finalize();
        });

        const stmtCandle = db.prepare(`INSERT OR REPLACE INTO CandleHistory (key, candles) VALUES (?, ?)`);
        Object.keys(candleHistory).forEach(k => {
            stmtCandle.run(k, JSON.stringify(candleHistory[k]));
        });
        stmtCandle.finalize();
    });
}

// Reset Game
function resetGame() {
    gameState = { round: 1, roundStart: null, gameStarted: false, news: '', oid: 0 };
    teams = {};
    orders = [];
    candleHistory = {};
    db.run("DELETE FROM Teams");
    db.run("DELETE FROM Orders");
    db.run("DELETE FROM CandleHistory");
    db.run("DELETE FROM GameState");
    saveStateToDB();
}

// Price Engine
function seededRand(seed){
  let x=Math.sin(seed)*10000;return x-Math.floor(x);
}
function getVolatilityMultiplier(elapsed){
  if(elapsed<0.30) return 1.8*(1-elapsed/0.30)+0.5;
  if(elapsed<0.70) return 0.5;
  if(elapsed<0.90) return 0.5+(elapsed-0.70)/0.20*0.8;
  return Math.max(0,(1-elapsed)/0.10)*0.6;
}
function gp(st){
  if(gameState.round===1) return PRICES[st][0];
  const r=gameState.round-1;
  const prevClose=PRICES[st][r-1];
  const target=PRICES[st][r];
  const elapsed=Math.min((Date.now()-(gameState.roundStart||Date.now()))/ROUND_DUR,1);

  const openingOffset=(target-prevClose)*0.60;
  const openPrice=prevClose+openingOffset;

  let trend;
  if(elapsed>=0.90){
    const conv=(elapsed-0.90)/0.10;
    const trendAt90=openPrice+(target-openPrice)*0.90;
    trend=trendAt90+(target-trendAt90)*conv;
  } else {
    trend=openPrice+(target-openPrice)*elapsed;
  }

  const tick=Math.floor(Date.now()/30000);
  const seed=st.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const n1=(seededRand(seed+tick*13+r*97)-0.5)*2;
  const n2=(seededRand(seed+tick*31+r*53)-0.5)*2;
  const baseVol=Math.abs(target-prevClose)*0.08*(1-elapsed*0.7)+Math.abs(prevClose)*0.005;
  const volMult=getVolatilityMultiplier(elapsed);
  const noise=(n1*.7+n2*.3)*baseVol*volMult;

  const lo=Math.min(openPrice,target)*0.90;
  const hi=Math.max(openPrice,target)*1.10;
  return Math.round(Math.max(lo,Math.min(hi,trend+noise)));
}

function getCandleKey(st){
  return st+'_r'+gameState.round;
}
function recordCandle(st){
  const key=getCandleKey(st);
  if(!candleHistory[key]) candleHistory[key]=[];
  const cur=gp(st);
  const now=Date.now();
  const bucketStart=Math.floor((now-gameState.roundStart)/CANDLE_INTERVAL)*CANDLE_INTERVAL+gameState.roundStart;
  const candles=candleHistory[key];
  const last=candles[candles.length-1];
  if(last&&last.t===bucketStart){
    last.h=Math.max(last.h,cur);
    last.l=Math.min(last.l,cur);
    last.c=cur;
  } else {
    candles.push({t:bucketStart,o:cur,h:cur,l:cur,c:cur});
    if(candles.length>40)candles.splice(0,candles.length-40);
  }
}

// Game Loop for recording candles
setInterval(() => {
    if(!gameState.gameStarted) return;
    const elapsed = Date.now() - gameState.roundStart;
    if(elapsed > ROUND_DUR && gameState.round > 1) return; // closed
    STOCKS.forEach(st => recordCandle(st));
    saveStateToDB();
}, 10000);

// Broadcast state to all clients
function broadcastState() {
    io.emit('stateUpdate', {
        gameState,
        teams,
        orders,
        candleHistory
    });
}
setInterval(broadcastState, 2000);

function isMarketClosed() {
    if(!gameState.gameStarted) return true;
    if(gameState.round === 1) return false;
    const elapsed = Date.now() - gameState.roundStart;
    return elapsed >= ROUND_DUR;
}

io.on('connection', (socket) => {
    socket.emit('stateUpdate', { gameState, teams, orders, candleHistory, PRICES, STOCKS, ROUND_DUR, START_CASH });
    
    socket.on('joinTeam', (name) => {
        name = name.trim();
        if(!teams[name]) {
            teams[name] = {cash: START_CASH, holdings: {}, avgBuy: {}};
            saveStateToDB();
        }
        socket.join(name);
        broadcastState();
    });

    // Trading Actions
    socket.on('execBuy', ({CU, SEL, qty}) => {
        if(isMarketClosed()) return socket.emit('toast', {msg:'Market is closed', err:true});
        if(gameState.round !== 1) return socket.emit('toast', {msg:'IPO buying only in Round 1', err:true});
        const price = PRICES[SEL][0];
        const total = qty * price;
        const tm = teams[CU];
        if(!tm) return;
        if(tm.cash < total) return socket.emit('toast', {msg:'Not enough cash', err:true});
        
        const ph = tm.holdings[SEL]||0, pa = tm.avgBuy[SEL]||0;
        tm.cash -= total;
        tm.holdings[SEL] = ph + qty;
        tm.avgBuy[SEL] = ph > 0 ? (pa*ph + price*qty)/(ph+qty) : price;
        saveStateToDB();
        socket.emit('toast', {msg: `Bought ${qty} × ${SEL} @ ₹${price}`});
        broadcastState();
    });

    socket.on('execSell', ({CU, SEL, qty, price}) => {
        if(isMarketClosed()) return socket.emit('toast', {msg:'Market is closed', err:true});
        const tm = teams[CU];
        if(!tm) return;
        const held = tm.holdings[SEL]||0;
        if(qty > held) return socket.emit('toast', {msg: `You only hold ${held} shares`, err:true});
        
        tm.holdings[SEL] = held - qty;
        gameState.oid++;
        orders.push({id: gameState.oid, stock: SEL, seller: CU, qty, price});
        saveStateToDB();
        socket.emit('toast', {msg: `Listed ${qty} × ${SEL} @ ₹${price}`});
        broadcastState();
    });

    socket.on('execOrdBuy', ({CU, SEL, ordId, qty}) => {
        if(isMarketClosed()) return socket.emit('toast', {msg:'Market is closed', err:true});
        const o = orders.find(x => x.id === ordId);
        if(!o || o.qty <= 0) return socket.emit('toast', {msg:'Order no longer available', err:true});
        if(o.seller === CU) return socket.emit('toast', {msg:"Can't buy your own order", err:true});
        
        const aq = Math.min(qty, o.qty);
        const total = aq * o.price;
        const buyer = teams[CU];
        if(!buyer) return;
        if(buyer.cash < total) return socket.emit('toast', {msg:'Not enough cash!', err:true});
        
        const ph = buyer.holdings[SEL]||0, pa = buyer.avgBuy[SEL]||0;
        buyer.cash -= total;
        buyer.holdings[SEL] = ph + aq;
        buyer.avgBuy[SEL] = ph > 0 ? (pa*ph + o.price*aq)/(ph+aq) : o.price;
        
        if(teams[o.seller]) teams[o.seller].cash += total;
        o.qty -= aq;
        saveStateToDB();
        socket.emit('toast', {msg: `Bought ${aq} × ${SEL} from ${o.seller} @ ₹${o.price}`});
        broadcastState();
    });

    socket.on('cancelOrder', ({CU, id}) => {
        const o = orders.find(x => x.id === id);
        if(!o) return;
        if(o.seller !== CU) return; // Authorization check
        if(teams[CU]) teams[CU].holdings[o.stock] = (teams[CU].holdings[o.stock]||0) + o.qty;
        o.qty = 0;
        saveStateToDB();
        socket.emit('toast', {msg: 'Order cancelled'});
        broadcastState();
    });

    // Admin Actions
    socket.on('adminAction', ({action, payload, pass}) => {
        if(pass !== ADMIN_PASS) return socket.emit('toast', {msg: 'Wrong password', err:true});
        
        if(action === 'addTeam') {
            const name = payload.trim();
            if(!name) return;
            if(teams[name]) return socket.emit('toast', {msg: 'Team already exists', err:true});
            teams[name] = {cash: START_CASH, holdings: {}, avgBuy: {}};
            saveStateToDB();
            socket.emit('toast', {msg: `"${name}" added!`});
        }
        else if(action === 'startGame') {
            if(Object.keys(teams).length === 0) return socket.emit('toast', {msg: 'Add at least one team first!', err:true});
            if(gameState.gameStarted) return socket.emit('toast', {msg: 'Game already started!', err:true});
            gameState.gameStarted = true;
            gameState.round = 1;
            gameState.roundStart = Date.now();
            saveStateToDB();
            io.emit('toast', {msg: '🚀 GAME STARTED — Round 1 IPO Phase!'});
        }
        else if(action === 'nextRound') {
            if(gameState.round >= 5) return socket.emit('toast', {msg: 'Already at Round 5!', err:true});
            gameState.round++;
            gameState.roundStart = Date.now();
            saveStateToDB();
            io.emit('toast', {msg: 'Advanced to Round '+gameState.round+'!'});
        }
        else if(action === 'endRoundNow') {
            gameState.roundStart = Date.now() - ROUND_DUR;
            saveStateToDB();
            io.emit('toast', {msg: 'Round ended.'});
        }
        else if(action === 'fastForward') {
            if(!gameState.gameStarted) return;
            gameState.roundStart = (gameState.roundStart || Date.now()) - 10000;
            saveStateToDB();
            socket.emit('toast', {msg: 'Fast forwarded 10s'});
        }
        else if(action === 'fastForwardTo') {
            if(!gameState.gameStarted) return;
            gameState.roundStart = Date.now() - ROUND_DUR + payload * 60 * 1000;
            saveStateToDB();
            socket.emit('toast', {msg: `Fast-forwarded to ${payload}m`});
        }
        else if(action === 'resetGame') {
            resetGame();
            io.emit('toast', {msg: 'GAME RESET'});
        }
        else if(action === 'broadcastNews') {
            gameState.news = payload.trim();
            saveStateToDB();
            io.emit('toast', {msg: 'News broadcast!'});
        }
        else if(action === 'clearNews') {
            gameState.news = '';
            saveStateToDB();
            socket.emit('toast', {msg: 'News cleared'});
        }
        else if(action === 'adminCancel') {
            const o = orders.find(x => x.id === payload);
            if(!o) return;
            if(teams[o.seller]) teams[o.seller].holdings[o.stock] = (teams[o.seller].holdings[o.stock]||0) + o.qty;
            o.qty = 0;
            saveStateToDB();
            socket.emit('toast', {msg: 'Order cancelled'});
        }
        broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
