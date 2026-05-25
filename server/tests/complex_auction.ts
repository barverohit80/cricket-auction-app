import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function runComplexTests() {
  console.log('--- STARTING COMPLEX E2E TEST (15 Players, 3 Teams, 200k Budget) ---');
  
  const admin: Socket = io(SERVER_URL);
  const owners: Socket[] = [io(SERVER_URL), io(SERVER_URL), io(SERVER_URL)];
  
  let auctionId = '';
  let latestData: any = null;

  const waitForSync = (condition: (d: any) => boolean, timeout = 20000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        admin.off('sync_all', handler);
        reject(new Error('Sync Timeout'));
      }, timeout);
      const handler = (data: any) => {
        latestData = data;
        if (condition(data)) {
          clearTimeout(timer);
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

  // 2. Create Auction
  const tournamentName = `Mega Auction ${Date.now()}`;
  admin.emit('create_auction', tournamentName);
  await new Promise<void>(r => admin.on('auction_created', r));
  console.log('✅ Mega Auction Created');

  const initData = await waitForSync(d => d.auctions.some((a: any) => a.name === tournamentName));
  auctionId = initData.auctions.find((a: any) => a.name === tournamentName).id;
  admin.emit('select_auction', auctionId);
  await new Promise<void>(r => admin.on('auction_selected', r));
  console.log(`✅ ID Found and Selected: ${auctionId}`);

  // 4. Add 3 Teams with 200k budget
  const teamNames = ['MI', 'CSK', 'RCB'];
  for (let i = 0; i < 3; i++) {
    admin.emit('add_team', { id: `team${i+1}`, name: teamNames[i], initialBudget: 200000 });
  }
  await waitForSync(d => d.activeAuction?.teams.length === 3);
  console.log('✅ 3 Teams Added');

  // 5. Add 15 Players
  for (let i = 1; i <= 15; i++) {
    admin.emit('add_player', { 
        id: `p${i}`, 
        name: `Player ${i}`, 
        role: i % 2 === 0 ? 'Bowler' : 'Batsman', 
        setId: 'Set 1', 
        basePrice: 10000 
    });
  }
  await waitForSync(d => d.activeAuction?.players.length === 15);
  console.log('✅ 15 Players Added');

  // 6. Simulate Full Auction Loop
  console.log('Starting Bidding Loop...');
  for (let i = 0; i < 15; i++) {
    admin.emit('next');
    await waitForSync(d => d.activeAuction?.state.currentPlayerIdx === i);
    admin.emit('start');
    
    const bidderIdx = i % 3;
    const bidAmount = 10000 + (i * 1000);
    
    owners[bidderIdx].emit('bid', { teamId: `team${bidderIdx + 1}`, amount: bidAmount });
    await waitForSync(d => d.activeAuction?.state.bidderId === `team${bidderIdx + 1}`);
    
    admin.emit('force_sell', { amount: bidAmount, bidderId: `team${bidderIdx + 1}` });
    await waitForSync(d => d.activeAuction?.players[i].status === 'Sold');
    process.stdout.write('.');
  }
  console.log('\n✅ All 15 Players Auctioned');

  // 7. Verify Results
  latestData.activeAuction.teams.forEach((t: any) => {
    console.log(`✅ Team ${t.name}: Squad=${t.squad.length}, Budget=${t.budget}`);
    if (t.squad.length !== 5) throw new Error(`Incorrect squad size for ${t.name}`);
  });

  // 8. Mark Completed
  admin.emit('mark_completed');
  await waitForSync(d => d.activeAuction?.state.isEnded === true);
  console.log('✅ Mega Auction Completed Successfully');

  console.log('--- ALL COMPLEX TESTS PASSED ---');
  process.exit(0);
}

runComplexTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
