import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
const NUM_CLIENTS = 5;
const clients: any[] = [];

async function startTest() {
  console.log('Starting Concurrency Test...');

  // 1. Connect multiple clients
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const socket = io(URL);
    clients.push(socket);
    await new Promise((resolve) => socket.on('connect', resolve));
  }
  console.log(`${NUM_CLIENTS} clients connected.`);

  const admin = clients[0];
  
  // 2. Setup: Add a team and a player
  admin.emit('add_team', { id: 'T1', name: 'Team 1', initialBudget: 100000000 });
  admin.emit('add_player', { id: 'P1', name: 'Test Player', role: 'Batsman', setId: 'Set 1', basePrice: 20000000 });
  
  await new Promise(r => setTimeout(r, 500));
  admin.emit('next'); // Set current player
  await new Promise(r => setTimeout(r, 500));
  admin.emit('start'); // Start bidding
  
  console.log('Setup complete. Starting rapid bidding...');

  // 3. Simulate rapid concurrent bids
  let bidCount = 0;
  const targetBids = 50;
  
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const bidderIdx = Math.floor(Math.random() * NUM_CLIENTS);
      const bidAmount = 20000000 + (bidCount * 1000000);
      
      clients[bidderIdx].emit('bid', { teamId: 'T1', amount: bidAmount });
      bidCount++;

      if (bidCount >= targetBids) {
        clearInterval(interval);
        console.log('Finished sending bids. Verifying state...');
        
        setTimeout(() => {
          admin.on('sync', (data: any) => {
            console.log('Final Bid in State:', data.state.currentBid);
            console.log('Expected minimum:', 20000000 + (targetBids - 1) * 1000000);
            if (data.state.currentBid >= 20000000 + (targetBids - 1) * 1000000) {
              console.log('SUCCESS: Concurrency handled correctly.');
            } else {
              console.error('FAILURE: Bids were lost or processed out of order.');
            }
            clients.forEach(s => s.disconnect());
            resolve(true);
          });
        }, 1000);
      }
    }, 10); // 10ms intervals - very fast
  });
}

startTest().catch(console.error);
