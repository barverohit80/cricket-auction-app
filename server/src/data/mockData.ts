export interface Player {
  id: string;
  name: string;
  role: 'Batsman' | 'Bowler' | 'All-rounder' | 'Wicketkeeper';
  basePrice: number;
  currentBid: number;
  highestBidder: string | null;
  status: 'Available' | 'Sold' | 'Unsold' | 'Ongoing';
  photoUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  purse: number;
  squad: string[]; // List of player IDs
}

export const players: Player[] = [
  { id: '1', name: 'Virat Kohli', role: 'Batsman', basePrice: 20000000, currentBid: 0, highestBidder: null, status: 'Available' },
  { id: '2', name: 'Jasprit Bumrah', role: 'Bowler', basePrice: 20000000, currentBid: 0, highestBidder: null, status: 'Available' },
  { id: '3', name: 'Rashid Khan', role: 'Bowler', basePrice: 15000000, currentBid: 0, highestBidder: null, status: 'Available' },
  { id: '4', name: 'Ben Stokes', role: 'All-rounder', basePrice: 20000000, currentBid: 0, highestBidder: null, status: 'Available' },
  { id: '5', name: 'Rishabh Pant', role: 'Wicketkeeper', basePrice: 15000000, currentBid: 0, highestBidder: null, status: 'Available' },
];

export const teams: Team[] = [
  { id: 'RCB', name: 'Royal Challengers Bangalore', purse: 800000000, squad: [] },
  { id: 'MI', name: 'Mumbai Indians', purse: 800000000, squad: [] },
  { id: 'CSK', name: 'Chennai Super Kings', purse: 800000000, squad: [] },
  { id: 'KKR', name: 'Kolkata Knight Riders', purse: 800000000, squad: [] },
];
