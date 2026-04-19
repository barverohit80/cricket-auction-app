import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');
const testId = 'test-' + Math.random().toString(36).substring(7);
let stage = 'init';

socket.on('connect', () => {
  console.log('1. Connected');
  socket.emit('add_player', { id: testId, name: 'TEST_REMOVE_ME', role: 'Batsman', basePrice: 5000, setId: 'Set 1' });
  stage = 'adding';
});

socket.on('sync', (data: any) => {
  const exists = data.players.some((p: any) => p.id == testId);
  console.log(`[SYNC] Stage: ${stage}, PlayerExists: ${exists}`);

  if (stage === 'adding' && exists) {
    console.log('2. Player in list. Sending remove {id: ...}...');
    stage = 'removing';
    socket.emit('remove_player', { id: testId }); // Sending as object
  } else if (stage === 'removing' && !exists) {
    console.log('3. SUCCESS: Player removed.');
    socket.disconnect();
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('FAILED: Timeout at stage', stage);
  process.exit(1);
}, 6000);
