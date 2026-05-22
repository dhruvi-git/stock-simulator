const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('mock_stock_simulator (2).html', 'utf8');

// Insert Socket.io script before the main script
content = content.replace('<script>', '<script src="/socket.io/socket.io.js"></script>\n<script>\nconst socket = io();');

// Replace gs() and sv() and ns() with global variables
const stateReplacement = `
let globalState = ns();
let STOCKS = [];
let PRICES = {};
let ROUND_DUR = 10*60*1000;
let START_CASH = 1500000;

socket.on('stateUpdate', (data) => {
    if(data.STOCKS) STOCKS = data.STOCKS;
    if(data.PRICES) PRICES = data.PRICES;
    if(data.ROUND_DUR) ROUND_DUR = data.ROUND_DUR;
    if(data.START_CASH) START_CASH = data.START_CASH;
    
    globalState.round = data.gameState.round;
    globalState.roundStart = data.gameState.roundStart;
    globalState.gameStarted = data.gameState.gameStarted;
    globalState.news = data.gameState.news;
    globalState.oid = data.gameState.oid;
    
    globalState.teams = data.teams;
    globalState.orders = data.orders;
    globalState.candleHistory = data.candleHistory;
    
    render();
});

socket.on('toast', (data) => {
    toast(data.msg, data.err);
});

function gs() { return globalState; }
function sv(s) { /* No-op, server handles state */ }
function ns() { return {round:1,roundStart:null,gameStarted:false,teams:{},orders:[],news:'',oid:0,candleHistory:{}}; }
`;

content = content.replace(/function gs\(\).*?function ns\(\).*?function sv\(s\).*?}/s, stateReplacement);

// Replace actions
content = content.replace(/function execBuy\(\).*?renderScreen\(\);\n}/s, `function execBuy(){
  const q=parseInt(document.getElementById('tp-qty')?.value)||0;
  socket.emit('execBuy', {CU, SEL, qty: q});
}`);

content = content.replace(/function execSell\(\).*?renderScreen\(\);\n}/s, `function execSell(){
  const q=parseInt(document.getElementById('tp-sq')?.value)||0;
  const p=parseFloat(document.getElementById('tp-sp')?.value)||0;
  socket.emit('execSell', {CU, SEL, qty: q, price: p});
}`);

content = content.replace(/function execOrdBuy\(ordId\).*?renderScreen\(\);\n}/s, `function execOrdBuy(ordId){
  const q=parseInt(document.getElementById('tp-bq')?.value)||0;
  socket.emit('execOrdBuy', {CU, SEL, ordId, qty: q});
}`);

content = content.replace(/function cancelOrder\(id\).*?renderScreen\(\);\n}/s, `function cancelOrder(id){
  socket.emit('cancelOrder', {CU, id});
}`);

content = content.replace(/function joinTeam\(\).*?startLoops\(\);\n}/s, `function joinTeam(){
  const el=document.getElementById('tni');if(!el)return;
  const name=el.value.trim();if(!name)return;
  CU=name;IA=false;TAB='market';SEL=null;ACTION='buy';
  socket.emit('joinTeam', name);
  render();startLoops();
}`);

const adminActions = `
function addTeam(){
  const el=document.getElementById('atn');if(!el)return;
  const name=el.value.trim();if(!name){toast('Enter a name',true);return}
  socket.emit('adminAction', {action: 'addTeam', payload: name, pass: ADMIN_PASS});
  el.value='';
}
function startGame(){ socket.emit('adminAction', {action: 'startGame', pass: ADMIN_PASS}); }
function nextRound(){ socket.emit('adminAction', {action: 'nextRound', pass: ADMIN_PASS}); }
function endRoundNow(){ if(confirm('End round?')) socket.emit('adminAction', {action: 'endRoundNow', pass: ADMIN_PASS}); }
function fastForward(){ socket.emit('adminAction', {action: 'fastForward', pass: ADMIN_PASS}); }
function fastForwardTo(m){ socket.emit('adminAction', {action: 'fastForwardTo', payload: m, pass: ADMIN_PASS}); }
function resetGame(){ if(confirm('Reset ALL?')) socket.emit('adminAction', {action: 'resetGame', pass: ADMIN_PASS}); }
function broadcastNews(){
  const el=document.getElementById('ni');if(!el)return;
  socket.emit('adminAction', {action: 'broadcastNews', payload: el.value.trim(), pass: ADMIN_PASS});
}
function clearNews(){ socket.emit('adminAction', {action: 'clearNews', pass: ADMIN_PASS}); }
function adminCancel(id){ socket.emit('adminAction', {action: 'adminCancel', payload: id, pass: ADMIN_PASS}); }
`;

content = content.replace(/function startGame\(\).*?adminSurgicalUpdate\(\);\n}/s, adminActions);

// Remove the constants declaration block since it's injected by socket
content = content.replace(/const STOCKS=.*?;/s, '');
content = content.replace(/const PRICES=.*?;/s, '');
content = content.replace(/const ROUND_DUR=.*?;/s, '');
content = content.replace(/const START_CASH=.*?;/s, '');

// Save to public/index.html
fs.writeFileSync('public/index.html', content);
console.log('Frontend built and saved to public/index.html');
