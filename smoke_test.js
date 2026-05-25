const io = require('socket.io-client');

const URL = 'http://localhost:3000';
const ADMIN_PASS = 'piyush26';

function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async function(){
  console.log('Connecting to', URL);
  const s = io(URL, { reconnection: false, timeout: 5000 });

  s.on('connect_error', (err) => { console.error('Connect error', err.message); process.exit(1); });
  s.on('connect', () => console.log('Connected to server'));
  s.on('disconnect', () => console.log('Disconnected'));
  s.on('toast', (t)=> console.log('TOAST:', t && t.msg));

  let lastState = null;
  s.on('stateUpdate', st => { lastState = st; /*console.log('stateUpdate');*/ });

  // wait for initial state
  for(let i=0;i<10 && !lastState;i++){ await wait(300); }
  if(!lastState){ console.error('No initial state received'); process.exit(1); }

  console.log('Initial round', lastState.gameState.round, 'teams:', Object.keys(lastState.teams).length);

  // Admin: add two teams
  s.emit('adminAction', { action: 'addTeam', payload: 'Alpha', pass: ADMIN_PASS });
  s.emit('adminAction', { action: 'addTeam', payload: 'Beta', pass: ADMIN_PASS });
  await wait(300);

  // Start game
  s.emit('adminAction', { action: 'startGame', payload: null, pass: ADMIN_PASS });
  await wait(500);

  // Join both teams
  s.emit('joinTeam', 'Alpha');
  s.emit('joinTeam', 'Beta');
  await wait(300);

  // Alpha does an IPO buy for GOLD qty 2
  console.log('Alpha buying 2 GOLD in IPO');
  s.emit('execBuy', { CU: 'Alpha', SEL: 'GOLD', qty: 2 });
  await wait(300);

  // Alpha lists 1 GOLD for sale
  console.log('Alpha listing 1 GOLD for sale @ current price');
  const price = lastState && lastState.PRICES && lastState.PRICES['GOLD'] ? lastState.PRICES['GOLD'][0] : null;
  s.emit('execSell', { CU: 'Alpha', SEL: 'GOLD', qty: 1, price: price });
  await wait(500);

  // Find an order to buy
  const orders = (lastState && lastState.orders) || [];
  const ord = orders.find(o => o.seller === 'Alpha' && o.stock === 'GOLD');
  if(!ord){ console.error('No order found to buy'); process.exit(1); }

  console.log('Beta buying from order', ord.id);
  s.emit('execOrdBuy', { CU: 'Beta', ordId: ord.id, qty: 1 });
  await wait(500);

  // Cancel any remaining orders by Alpha (if any)
  if(ord && ord.qty > 0){
    s.emit('cancelOrder', { CU: 'Alpha', id: ord.id });
    await wait(300);
  }

  // Admin fastForwardTo 9 (near end)
  s.emit('adminAction', { action: 'fastForwardTo', payload: 9, pass: ADMIN_PASS });
  await wait(300);

  console.log('Final teams summary:');
  console.log(JSON.stringify(lastState.teams, null, 2));
  console.log('Final orders:', JSON.stringify(lastState.orders, null, 2));

  s.close();
  process.exit(0);
})();
