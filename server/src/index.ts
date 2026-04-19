import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'auctions_v2.json');

const app = express();
app.use(cors({ origin: '*' }));

const httpServer = createServer(app);
const io = new Server(httpServer, { 
  cors: { 
    origin: '*',
    methods: ["GET", "POST"],
    credentials: true
  } 
});

interface AuctionData {
  id: string;
  name: string;
  players: any[];
  teams: any[];
  state: any;
}

let auctions: AuctionData[] = [];
let activeAuctionId: string | null = null;

const createInitialState = (name: string) => ({
  currentPlayerIdx: -1,
  currentBid: 0,
  bidderId: null,
  timer: 30,
  isPaused: true,
  isEnded: false,
  playersPerTeam: 11,
  budgetPerTeam: 0,
  tournamentName: name
});

const load = () => {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      auctions = d.auctions || [];
      activeAuctionId = d.activeAuctionId || (auctions.length > 0 ? auctions[0].id : null);
    } catch (e) { console.error("Error loading data:", e); }
  }
};

const save = () => {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ auctions, activeAuctionId }, null, 2));
  } catch (e) { console.error("Error saving data:", e); }
};

load();

const getActiveAuction = () => auctions.find(a => a.id === activeAuctionId);

let interval: NodeJS.Timeout | null = null;

const emitSync = () => {
  const active = getActiveAuction();
  console.log('[SERVER] Syncing. Active:', active?.name || 'NONE');
  io.emit('sync_all', { 
    auctions: auctions.map(a => ({ id: a.id, name: a.name, isEnded: a.state.isEnded })), 
    activeAuction: active 
  });
};

const formatK = (num: number) => {
  if (num >= 10000000) return `₹${(num/10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num/100000).toFixed(2)}L`;
  if (num >= 1000) {
    const k = num / 1000;
    return `₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `₹${num}`;
};

const startAuctionTimer = () => {
  const active = getActiveAuction();
  if (!active) return;
  active.state.isPaused = false;
  
  if (interval) clearInterval(interval);
  interval = setInterval(() => {
    if (active.state.timer > 0) {
      active.state.timer--;
      io.emit('tick', active.state.timer);
      if (active.state.timer === 0) {
        const p = active.players[active.state.currentPlayerIdx];
        if (p) {
          if (active.state.bidderId) {
            p.status = 'Sold';
            p.soldPrice = active.state.currentBid;
            p.teamId = active.state.bidderId;
            const t = active.teams.find((x:any) => x.id === active.state.bidderId);
            if (t) { t.budget -= active.state.currentBid; t.squad.push(p.id); }
          } else {
            p.status = 'Unsold';
          }
        }
        active.state.isPaused = true;
        if (interval) clearInterval(interval);
        save();
        emitSync();
      }
    }
  }, 1000);
  emitSync();
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  const active = getActiveAuction();
  socket.emit('sync_all', { 
    auctions: auctions.map(a => ({ id: a.id, name: a.name, isEnded: a.state.isEnded })), 
    activeAuction: active 
  });

  socket.on('create_auction', (name) => {
    console.log('[SERVER] Create request:', name);
    if (auctions.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      console.log('[SERVER] Rejected: Duplicate');
      return socket.emit('error_msg', 'An auction with this name already exists!');
    }
    const newAuction: AuctionData = {
      id: Date.now().toString(),
      name: name,
      players: [],
      teams: [],
      state: createInitialState(name)
    };
    auctions.push(newAuction);
    activeAuctionId = newAuction.id;
    console.log('[SERVER] Auction Created:', name, 'Active ID:', activeAuctionId);
    save();
    socket.emit('auction_created'); 
    emitSync();
  });

  socket.on('select_auction', (id) => {
    console.log('[SERVER] Select request:', id);
    if (interval) clearInterval(interval);
    activeAuctionId = id;
    save();
    socket.emit('auction_selected');
    emitSync();
  });

  socket.on('update_settings', (settings) => {
    const active = getActiveAuction();
    if (active) {
      active.state = { ...active.state, ...settings };
      save();
      emitSync();
    }
  });

  socket.on('add_team', (t) => {
    const active = getActiveAuction();
    if (active) {
      active.teams.push({ ...t, budget: t.initialBudget, squad: [] });
      save();
      emitSync();
    }
  });

  socket.on('add_player', (p) => {
    const active = getActiveAuction();
    if (active) {
      active.players.push({ ...p, status: 'Available' });
      save();
      emitSync();
    }
  });

  socket.on('remove_player', (input) => {
    const active = getActiveAuction();
    if (!active) return;
    const id = typeof input === 'object' ? input.id : input;
    const idx = active.players.findIndex(p => p.id == id);
    if (idx !== -1) {
      if (idx < active.state.currentPlayerIdx) active.state.currentPlayerIdx--;
      else if (idx === active.state.currentPlayerIdx) {
        active.state.bidderId = null; active.state.currentBid = 0; active.state.timer = 30; active.state.isPaused = true;
        if (interval) clearInterval(interval);
      }
      active.players = active.players.filter(p => p.id != id);
      if (active.state.currentPlayerIdx >= active.players.length) active.state.currentPlayerIdx = active.players.length - 1;
      if (active.players.length === 0) active.state.currentPlayerIdx = -1;
      save();
      setTimeout(emitSync, 50);
    }
  });

  socket.on('start', startAuctionTimer);

  socket.on('bid', ({ teamId, amount }) => {
    const active = getActiveAuction();
    if (!active || active.state.isEnded) return;
    const bidAmount = Number(amount);
    const team = active.teams.find(t => t.id === teamId);
    if (!team || team.squad.length >= active.state.playersPerTeam || team.budget < bidAmount) return;

    const MIN_BASE_PRICE = 5000;
    const playersNeededAfterThis = active.state.playersPerTeam - (team.squad.length + 1);
    const requiredReserve = playersNeededAfterThis * MIN_BASE_PRICE;
    const maxAllowedBid = team.budget - requiredReserve;

    if (bidAmount > maxAllowedBid) {
      return socket.emit('error_msg', `Reserve ${formatK(requiredReserve)} for ${playersNeededAfterThis} more slots.`);
    }

    const isFirstBidAtBase = !active.state.bidderId && bidAmount >= active.state.currentBid;
    if (bidAmount > active.state.currentBid || isFirstBidAtBase) {
      active.state.currentBid = bidAmount;
      active.state.bidderId = teamId;
      active.state.timer = 30;
      startAuctionTimer();
      save();
      emitSync();
    }
  });

  socket.on('next', () => {
    const active = getActiveAuction();
    if (!active) return;
    if (active.state.currentPlayerIdx < active.players.length - 1) {
      active.state.currentPlayerIdx++;
      active.state.currentBid = active.players[active.state.currentPlayerIdx].basePrice;
      active.state.bidderId = null;
      active.state.timer = 30;
      active.state.isPaused = true;
    } else {
      active.state.isEnded = true;
      active.state.isPaused = true;
    }
    if (interval) clearInterval(interval);
    save();
    emitSync();
  });

  socket.on('manual_bid_update', ({ amount, bidderId }) => {
    const active = getActiveAuction();
    if (active) {
      active.state.currentBid = Number(amount);
      active.state.bidderId = bidderId || null;
      save();
      emitSync();
    }
  });

  socket.on('edit_team', ({ id, name, initialBudget }) => {
    const active = getActiveAuction();
    if (active) {
      const team = active.teams.find(t => t.id === id);
      if (team) {
        team.name = name;
        team.initialBudget = initialBudget;
        if (team.squad.length === 0) team.budget = initialBudget;
        save();
        emitSync();
      }
    }
  });

  socket.on('force_sell', (manualData) => {
    const active = getActiveAuction();
    if (!active) return;
    const p = active.players[active.state.currentPlayerIdx];
    const finalBidderId = manualData?.bidderId || active.state.bidderId;
    const finalAmount = manualData?.amount !== undefined ? Number(manualData.amount) : active.state.currentBid;
    if (p && finalBidderId) {
      if (p.status === 'Sold' && p.teamId) {
        const oldTeam = active.teams.find(t => t.id === p.teamId);
        if (oldTeam) { oldTeam.budget += p.soldPrice || 0; oldTeam.squad = oldTeam.squad.filter(id => id !== p.id); }
      }
      p.status = 'Sold'; p.soldPrice = finalAmount; p.teamId = finalBidderId;
      const t = active.teams.find(x => x.id === finalBidderId);
      if (t) { t.budget -= finalAmount; if (!t.squad.includes(p.id)) t.squad.push(p.id); }
      active.state.currentBid = finalAmount; active.state.bidderId = finalBidderId; active.state.isPaused = true;
      if (interval) clearInterval(interval);
      save();
      emitSync();
    }
  });

  socket.on('manual_unsold', () => {
    const active = getActiveAuction();
    if (!active) return;
    const p = active.players[active.state.currentPlayerIdx];
    if (p) {
      if (p.status === 'Sold' && p.teamId) {
        const oldTeam = active.teams.find(t => t.id === p.teamId);
        if (oldTeam) { oldTeam.budget += p.soldPrice || 0; oldTeam.squad = oldTeam.squad.filter(id => id !== p.id); }
      }
      p.status = 'Unsold'; p.soldPrice = undefined; p.teamId = undefined; active.state.isPaused = true;
      if (interval) clearInterval(interval);
      save();
      emitSync();
    }
  });

  socket.on('mark_completed', () => {
    const active = getActiveAuction();
    if (active) {
      active.state.isEnded = true;
      active.state.isPaused = true;
      if (interval) clearInterval(interval);
      save();
      emitSync();
    }
  });

  socket.on('delete_auction', (id) => {
    auctions = auctions.filter(a => a.id !== id);
    if (activeAuctionId === id) activeAuctionId = auctions.length > 0 ? auctions[0].id : null;
    save();
    emitSync();
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Cricket Auction Server on ${PORT}`));
