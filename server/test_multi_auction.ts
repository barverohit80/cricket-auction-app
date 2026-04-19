import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');
const auc1Name = 'Tournament Alpha ' + Math.random().toString(36).substring(7);
const auc2Name = 'Tournament Beta ' + Math.random().toString(36).substring(7);

let stage = 'init';

socket.on('connect', () => {
  console.log('Connected to server');
  console.log('1. Creating first auction:', auc1Name);
  socket.emit('create_auction', auc1Name);
  stage = 'create_auc1';
});

socket.on('sync_all', (data: any) => {
  const active = data.activeAuction;
  const list = data.auctions;
  console.log('[DEBUG] Sync received. Active:', active?.name, 'List size:', list.length);

  if (stage === 'create_auc1' && active?.name === auc1Name) {
    console.log('   Success: Auction 1 created and active.');
    console.log('2. Adding a player to Auction 1...');
    socket.emit('add_player', { id: 'p1', name: 'Alpha Player', role: 'Batsman', basePrice: 5000 });
    
    setTimeout(() => {
        console.log('3. Creating second auction:', auc2Name);
        stage = 'create_auc2';
        socket.emit('create_auction', auc2Name);
    }, 1000);

  } else if (stage === 'create_auc2' && active?.name === auc2Name) {
    console.log('   Success: Auction 2 created and active.');
    // Check if Auction 1 still exists in list
    const hasAuc1 = list.some((a: any) => a.name === auc1Name);
    if (hasAuc1) {
        console.log('   Verified: Auction 1 persists in the list.');
    }

    console.log('4. Attempting to create duplicate auction...');
    stage = 'duplicate_check';
    socket.emit('create_auction', auc2Name);

  } else if (stage === 'duplicate_check') {
      // We expect an error_msg for this stage
  } else if (stage === 'switching' && active?.name === auc1Name) {
      console.log('   Success: Switched back to Auction 1.');
      const hasPlayer = active.players.some((p: any) => p.name === 'Alpha Player');
      if (hasPlayer) {
          console.log('   Verified: Auction 1 data (players) is intact.');
          console.log('\n--- ALL MULTI-AUCTION TESTS PASSED ---');
          process.exit(0);
      } else {
          console.error('   FAILED: Auction 1 data was lost!');
          process.exit(1);
      }
  }
});

socket.on('error_msg', (msg) => {
    if (stage === 'duplicate_check' && msg.includes('already exists')) {
        console.log('   Success: Duplicate name correctly rejected.');
        console.log('5. Switching back to Auction 1...');
        stage = 'switching';
        const auc1 = auctions_list.find((a:any) => a.name === auc1Name);
        socket.emit('select_auction', auc1.id);
    }
});

// Helper to keep track of list for the error handler
let auctions_list: any[] = [];
socket.on('sync_all', (data) => { auctions_list = data.auctions; });

setTimeout(() => {
  console.error('Test timed out at stage:', stage);
  process.exit(1);
}, 10000);
