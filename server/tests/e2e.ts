import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
  console.log('--- STARTING E2E TEST ---');
  
  const admin: Socket = io(SERVER_URL);
  const owner: Socket = io(SERVER_URL);
  
  let auctionId = '';

  const waitForSync = (condition: (data: any) => boolean): Promise<any> => {
    return new Promise((resolve) => {
      const handler = (data: any) => {
        if (condition(data)) {
          admin.off('sync_all', handler);
          resolve(data);
        }
      };
      admin.on('sync_all', handler);
    });
  };

  // 1. Connection
  await new Promise<void>(r => admin.on('connect', r));
  console.log('✅ Admin Connected');

  // 2. Create
  const tournamentName = `Test Tournament ${Date.now()}`;
  admin.emit('create_auction', tournamentName);
  await new Promise<void>(r => admin.on('auction_created', r));
  console.log('✅ Auction Created');

  // 3. Get ID
  const data = await waitForSync(d => d.auctions.some((a: any) => a.name === tournamentName));
  auctionId = data.auctions.find((a: any) => a.name === tournamentName).id;
  console.log(`✅ ID Found: ${auctionId}`);

  // 4. Add Team
  admin.emit('add_team', { id: 'team1', name: 'MI', initialBudget: 100000 });
  await waitForSync(d => d.activeAuction?.teams.some((t: any) => t.id === 'team1'));
  console.log('✅ Team Added');

  // 5. Add Players
  admin.emit('add_player', { id: 'p1', name: 'Virat', role: 'Batsman', setId: 'S1', basePrice: 10000 });
  await waitForSync(d => d.activeAuction?.players.some((p: any) => p.id === 'p1'));
  console.log('✅ Player Added');

  // 6. Start & Bid
  admin.emit('next');
  await waitForSync(d => d.activeAuction?.players[d.activeAuction.state.currentPlayerIdx]?.id === 'p1');
  
  admin.emit('start');
  setTimeout(() => owner.emit('bid', { teamId: 'team1', amount: 15000 }), 500);
  await waitForSync(d => d.activeAuction?.state.bidderId === 'team1');
  console.log('✅ Bid Successful');

  // 7. Force Sell
  admin.emit('force_sell', { amount: 15000, bidderId: 'team1' });
  await waitForSync(d => d.activeAuction?.players.find((p:any)=>p.id==='p1').status === 'Sold');
  console.log('✅ Force Sell Successful');

  // 8. Mark Completed
  admin.emit('mark_completed');
  await waitForSync(d => d.activeAuction?.state.isEnded === true);
  console.log('✅ Marked Completed');

  console.log('--- ALL E2E TESTS PASSED ---');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
