import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import './App.css';

import batsmanImg from './assets/batsman.webp';
import bowlerImg from './assets/bowler.webp';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

function formatK(num: number) {
  if (num >= 10000000) return `₹${(num/10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num/100000).toFixed(2)}L`;
  if (num >= 1000) {
    const k = num / 1000;
    return `₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `₹${num}`;
}

function getPlayerImage(p: any) {
  if (p.role.toLowerCase() === 'batsman') return batsmanImg;
  if (p.role.toLowerCase() === 'bowler') return bowlerImg;
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

function LoginScreen({ auctions, data }: { auctions: any[], data: any }) {
  const navigate = useNavigate();
  const [loginStep, setLoginStep] = useState<'main' | 'auctions' | 'teams'>('main');

  const login = (r: string, tid?: string) => {
    sessionStorage.setItem('role', r);
    if (tid) sessionStorage.setItem('teamId', tid);
    if (r === 'admin') navigate('/hub');
    else if (data) navigate(`/auction/${data.id}`);
  };

  return (
    <div className="login-screen">
      <h1>Welcome to Auction</h1>
      <div className="login-box">
        {loginStep === 'main' && (
          <div className="main-actions animate-fade-in">
            <button className="auction-btn" onClick={() => login('admin')}>
              <span className="icon">🎤</span>AUCTIONEER
            </button>
            <button className="owner-btn" onClick={() => setLoginStep('auctions')}>
              <span className="icon">🏏</span>OWNER
            </button>
          </div>
        )}

        {loginStep === 'auctions' && (
          <div className="auction-select animate-fade-in">
            <div className="box-header">
              <button className="back-btn" onClick={() => setLoginStep('main')}>← Back</button>
              <h3>Select Tournament</h3>
            </div>
            <div className="auction-list">
              {auctions.slice().sort((a,b) => Number(b.id) - Number(a.id)).map(a => (
                <button 
                  key={a.id} 
                  className={`auction-item-card ${a.isEnded ? 'completed' : 'live'}`} 
                  onClick={() => { 
                    socket.emit('select_auction', a.id); 
                    if (a.isEnded) {
                       login('team'); 
                    } else {
                      setLoginStep('teams'); 
                    }
                  }}
                >
                  <div className="auc-info">
                    <span className={`status-dot ${a.isEnded ? 'gray' : 'green'}`}></span>
                    <div className="auc-details">
                      <h4>{a.name}</h4>
                      <p>{a.isEnded ? 'AUCTION COMPLETED' : 'LIVE AUCTION'}</p>
                    </div>
                  </div>
                  <span className="chevron">{a.isEnded ? 'View Results' : 'Join'} →</span>
                </button>
              ))}
              {auctions.length === 0 && <p className="empty-msg">No tournaments found.</p>}
            </div>
          </div>
        )}

        {loginStep === 'teams' && (
          <div className="team-select animate-fade-in">
            <div className="box-header">
              <button className="back-btn" onClick={() => setLoginStep('auctions')}>← Back</button>
              <h3>Select Your Team</h3>
            </div>
            <div className="team-grid">
              {data?.teams.map((t: any) => (
                <button key={t.id} onClick={() => login('team', t.id)}>{t.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuctioneerHub({ auctions, data }: { auctions: any[], data: any }) {
  const navigate = useNavigate();
  const [newAuctionName, setNewAuctionName] = useState('');

  const logout = () => { sessionStorage.clear(); navigate('/'); };

  if (!data) return (
    <div className="admin-dashboard">
        <header><h1>AUCTIONEER HUB</h1><button className="logout-btn" onClick={logout}>Logout</button></header>
        <div className="setup-container">
            <div className="setup-card">
                <h3>Create New Auction</h3>
                <div className="form-group">
                    <input placeholder="Enter Tournament Name" value={newAuctionName} onChange={e => setNewAuctionName(e.target.value)} />
                    <button onClick={() => { if(newAuctionName) { socket.emit('create_auction', newAuctionName); setNewAuctionName(''); } }}>Create Auction</button>
                </div>
            </div>
            <div className="list-section">
                <h3>Existing Auctions</h3>
                <div className="scroll-list">
                    {auctions.slice().sort((a,b) => Number(b.id) - Number(a.id)).map(a => (
                        <div key={a.id} className={`list-item clickable-item ${a.isEnded ? 'ended' : 'active'}`} onClick={() => socket.emit('select_auction', a.id)}>
                            <div className="item-main">
                                <span className="item-name">{a.name}</span>
                                <span className={`item-status ${a.isEnded ? 'status-ended' : 'status-active'}`}>
                                    {a.isEnded ? 'COMPLETED' : 'INCOMPLETE'}
                                </span>
                            </div>
                            <span className="item-arrow">→</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="admin-dashboard">
      <header>
        <div className="logo-section">
            <button className="back-hub-btn" onClick={() => socket.emit('select_auction', null)}>← HUB</button>
            <h1>{data.name}</h1>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </header>
      <div className="dashboard-grid">
        <button className="dash-card" onClick={() => navigate(`/setup/${data.id}`)}>
          <span className="dash-icon">⚙️</span><h2>SETUP</h2>
        </button>
        {!data.state.isEnded && (
          <button className="dash-card" onClick={() => navigate(`/auction/${data.id}`)}>
            <span className="dash-icon">⚡</span><h2>RESUME AUCTION</h2>
          </button>
        )}
        <button className="dash-card" onClick={() => navigate(`/auction/${data.id}`)}>
          <span className="dash-icon">📊</span><h2>VIEW REPORT</h2>
        </button>
        <button className="dash-card warning" onClick={() => { if(window.confirm("DELETE?")) { socket.emit('delete_auction', data.id); navigate('/hub'); } }}>
          <span className="dash-icon">🗑️</span><h2>DELETE</h2>
        </button>
      </div>
    </div>
  );
}

function SetupPage({ data }: { data: any }) {
  const navigate = useNavigate();
  const [tName, setTName] = useState('');
  const [tBudget, setTBudget] = useState(0);
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState('Batsman');
  const [pBase, setPBase] = useState(5000);
  const [editingTeam, setEditingTeam] = useState<any>(null);

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const excelData: any[] = XLSX.utils.sheet_to_json(ws);
      excelData.forEach((row, index) => {
        const name = row['Player Name'] || row['name'];
        const skill = row['Skill'] || row['role'] || 'Batsman';
        const mobile = row['Mobile number'] || row['mobile'] || '';
        if (name) socket.emit('add_player', { id: (Date.now() + index).toString(), name, role: skill, setId: 'Set 1', basePrice: pBase, mobile });
      });
      alert(`Processed ${excelData.length} players.`);
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  if (!data) return <div className="loading">Loading Setup...</div>;
  const { players, teams, state } = data;

  return (
    <div className="setup-screen">
      <header>
        <button className="back-hub-btn" onClick={() => navigate('/hub')}>← HUB</button>
        <h1>AUCTION SETUP: {data.name}</h1>
        <button className="start-now-btn" onClick={() => { if(players.length > 0) { socket.emit('next'); navigate(`/auction/${data.id}`); } else { alert('Add at least one player'); } }}>
          START AUCTION 🚀
        </button>
      </header>

      <div className="setup-container">
        <div className="setup-forms">
          <div className="setup-card">
            <h3>Team Management</h3>
            <div className="form-group">
              <input placeholder="Team Name" value={tName} onChange={e => setTName(e.target.value)} />
              <button onClick={() => { socket.emit('add_team', { id: Date.now().toString(), name: tName, initialBudget: 100000 }); setTName(''); }}>Add Team</button>
            </div>
          </div>
          <div className="setup-card">
            <h3>Player Management</h3>
            <div className="form-group">
              <input placeholder="Player Name" value={pName} onChange={e => setPName(e.target.value)} />
              <select value={pRole} onChange={e => setPRole(e.target.value)}>
                <option>Batsman</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option>
              </select>
              <button onClick={() => { socket.emit('add_player', { id: Date.now().toString(), name: pName, role: pRole, setId: 'Set 1', basePrice: pBase }); setPName(''); }}>Add Player</button>
              <input type="file" accept=".xlsx" onChange={handleFileUpload} />
            </div>
          </div>
        </div>
        <div className="setup-lists">
          <div className="list-section"><h3>Teams ({teams.length})</h3><div className="scroll-list">{teams.map((t:any) => <div key={t.id} className="list-item"><span>{t.name}</span></div>)}</div></div>
          <div className="list-section"><h3>Players ({players.length})</h3><div className="scroll-list">{players.map((p:any) => <div key={p.id} className="list-item"><span>{p.name} ({p.role})</span></div>)}</div></div>
        </div>
      </div>
    </div>
  );
}

function LiveAuction({ data }: { data: any }) {
  const navigate = useNavigate();
  const role = sessionStorage.getItem('role');
  const myTeamId = sessionStorage.getItem('teamId');

  // Modals
  const [showUnsoldModal, setShowUnsoldModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);

  const downloadPDF = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${data.name}_Report.pdf`);
  };

  if (!data) return <div className="loading">Loading Auction...</div>;

  const { players, teams, state } = data;
  const currentP = players[state.currentPlayerIdx];

  if (state.isEnded || (role === 'admin' && !currentP)) {
     return (
      <div className="report-screen">
        <header>
          <h1>AUCTION COMPLETED</h1>
          <div className="header-actions">
            <button className="download-btn" onClick={downloadPDF}>Download PDF 📥</button>
            {role === 'admin' && <button onClick={() => navigate('/hub')}>Back to Hub</button>}
            <button onClick={() => { sessionStorage.clear(); navigate('/'); }}>Logout</button>
          </div>
        </header>
        <div className="report-grid" id="report-content">
          {teams.map((t: any) => (
            <div key={t.id} className="team-report-card">
              <h2>{t.name}</h2><p className="purse">Remaining Purse: {formatK(t.budget)}</p>
              <div className="squad-list">{players.filter((p:any) => p.teamId === t.id).map((p:any) => (<div key={p.id} className="squad-item"><span>{p.name} ({p.role})</span><b>{formatK(p.soldPrice || 0)}</b></div>))}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
       {showUnsoldModal && (<div className="modal-overlay" onClick={() => setShowUnsoldModal(false)}><div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Unsold Players</h2><button className="close-btn" onClick={() => setShowUnsoldModal(false)}>×</button></div><div className="modal-body"><div className="unsold-grid">{players.filter((p:any) => p.status === 'Unsold').map((p:any) => (<div key={p.id} className="unsold-card"><h4>{p.name}</h4><p>{p.role}</p><b>Base: {formatK(p.basePrice)}</b></div>))}{players.filter((p:any) => p.status === 'Unsold').length === 0 && <p className="empty-msg">No unsold players yet.</p>}</div></div></div></div>)}
       {showRosterModal && (<div className="modal-overlay" onClick={() => setShowRosterModal(false)}><div className="modal-content large animate-fade-in" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Team Roster Details</h2><button className="close-btn" onClick={() => setShowRosterModal(false)}>×</button></div><div className="modal-body"><div className="roster-grid">{teams.map((t:any) => (<div key={t.id} className="team-roster-card"><div className="roster-team-header"><div><h3>{t.name}</h3><div className={`squad-count ${t.squad.length >= state.playersPerTeam ? 'full' : ''}`}>SQUAD: {t.squad.length} / {state.playersPerTeam}</div></div><span className="roster-purse">Left: {formatK(t.budget)}</span></div><div className="roster-list">{players.filter((p:any) => p.teamId === t.id).map((p:any) => (<div key={p.id} className="roster-item"><span>{p.name} ({p.role.substring(0,3)})</span><b>{formatK(p.soldPrice || 0)}</b></div>))}{players.filter((p:any) => p.teamId === t.id).length === 0 && <p className="empty-msg">Empty Squad</p>}</div></div>))}</div></div></div></div>)}
       {showSoldModal && (<div className="modal-overlay" onClick={() => setShowSoldModal(false)}><div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Sold Players List</h2><button className="close-btn" onClick={() => setShowSoldModal(false)}>×</button></div><div className="modal-body"><div className="sold-players-full-list">{players.filter((p:any) => p.status === 'Sold').map((p:any) => (<div key={p.id} className="sold-item-row"><div className="sold-item-info"><strong>{p.name}</strong><span>{p.role}</span></div><div className="sold-item-buyer"><span>{teams.find((t:any)=>t.id === p.teamId)?.name}</span><b>{formatK(p.soldPrice || 0)}</b></div></div>))}{players.filter((p:any) => p.status === 'Sold').length === 0 && <p className="empty-msg">No players sold yet.</p>}</div></div></div></div>)}
       {showUpcomingModal && (<div className="modal-overlay" onClick={() => setShowUpcomingModal(false)}><div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Upcoming Players</h2><button className="close-btn" onClick={() => setShowUpcomingModal(false)}>×</button></div><div className="modal-body"><div className="upcoming-list">{players.slice(state.currentPlayerIdx + 1).map((p:any) => (<div key={p.id} className="upcoming-item"><span>{p.name} ({p.role})</span><b>Base: {formatK(p.basePrice)}</b></div>))}{players.slice(state.currentPlayerIdx + 1).length === 0 && <p className="empty-msg">No more players left.</p>}</div></div></div></div>)}

      <header>
        <div className="logo-section">
          {role === 'admin' && <button className="back-hub-btn" onClick={() => navigate('/hub')}>← HUB</button>}
          <h1>{state.tournamentName} - LIVE</h1>
        </div>
        <button className="logout-btn" onClick={() => { sessionStorage.clear(); navigate('/'); }}>Logout</button>
      </header>
      <main>
        <div className="auction-main">
          {currentP && (
            <div className={`live-card ${currentP.role.toLowerCase().replace('-', '')}`}>
              <div className="card-header">
                <div className="set-tag">{currentP.setId}</div>
                <div className={`modern-timer ${state.timer < 10 ? 'critical' : ''}`}>
                  <svg className="timer-svg" viewBox="0 0 100 100"><circle className="timer-bg" cx="50" cy="50" r="45" /><circle className="timer-progress" cx="50" cy="50" r="45" style={{ strokeDashoffset: (283 - (283 * state.timer) / 30) }} /></svg>
                  <div className="timer-value">{state.timer}</div>
                </div>
              </div>
              <div className="player-profile"><div className={`player-avatar role-anim-${currentP.role.toLowerCase().replace('-', '')}`}><img src={getPlayerImage(currentP)} alt={currentP.name} className="avatar-img" /></div><div className="player-title"><h1>{currentP.name}</h1><span className={`role-badge ${currentP.role.toLowerCase().replace('-', '')}`}>{currentP.role}</span></div></div>
              <hr className="divider" />
              <div className="bid-dashboard">
                <div className="stat-box base"><label>BASE PRICE</label><div className="val">{formatK(currentP.basePrice)}</div></div>
                <div className="stat-box highlight"><label>CURRENT BID</label><div className="val">{formatK(state.currentBid)}</div></div>
                <div className="stat-box bidder"><label>CURRENT BIDDER</label><div className="val">{teams.find((t:any)=>t.id === state.bidderId)?.name || 'Waiting...'}</div></div>
              </div>
              {role === 'team' && currentP.status === 'Available' && (
                <div className="bid-controls">
                  <button onClick={() => socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 5000 })}>+5k</button>
                  <button onClick={() => socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 10000 })}>+10k</button>
                  <button onClick={() => socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 25000 })}>+25k</button>
                </div>
              )}
            </div>
          )}
          {role === 'admin' && currentP && (
            <div className="admin-controls">
              <button onClick={() => socket.emit('start')} className="start-btn">Start Bidding</button>
              <button onClick={() => socket.emit('next')}>Next Player</button>
              <button onClick={() => { if(window.confirm("End this auction?")) socket.emit('mark_completed'); }}>🏁 END</button>
            </div>
          )}
        </div>
        <div className="sidebar">
          <div className="status-panel"><h3>Quick View</h3><div className="utility-grid"><button className="sidebar-btn sold" onClick={() => setShowSoldModal(true)}>SOLD</button><button className="sidebar-btn unsold" onClick={() => setShowUnsoldModal(true)}>UNSOLD</button><button className="sidebar-btn rosters" onClick={() => setShowRosterModal(true)}>ROSTERS</button><button className="sidebar-btn upcoming" onClick={() => setShowUpcomingModal(true)}>UPCOMING</button></div></div>
          <div className="status-panel"><h3>Teams</h3><div className="sold-players-list">{teams.map((t: any) => (<div key={t.id} className="sold-item"><span>{t.name}</span><b>{formatK(t.budget)}</b></div>))}</div></div>
        </div>
      </main>
    </div>
  );
}

function MainApp() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    socket.on('sync_all', ({ auctions, activeAuction }) => {
      setAuctions(auctions);
      setData(activeAuction);
    });
    socket.on('auction_created', () => {
       // activeAuction is already synced via sync_all usually, but we need the ID
    });
    socket.on('error_msg', (msg) => alert(msg));
    return () => { socket.off('sync_all'); socket.off('error_msg'); };
  }, []);

  // Effect to handle navigation when data is selected/created/deleted
  useEffect(() => {
    if (!data) {
       const path = window.location.pathname;
       if (path.startsWith('/auction/') || path.startsWith('/setup/')) {
          navigate('/hub');
       }
    }
  }, [data, navigate]);

  return (
    <Routes>
      <Route path="/" element={<LoginScreen auctions={auctions} data={data} />} />
      <Route path="/hub" element={<AuctioneerHub auctions={auctions} data={data} />} />
      <Route path="/auction/:id" element={<LiveAuction data={data} />} />
      <Route path="/setup/:id" element={<SetupPage data={data} />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <MainApp />
    </Router>
  );
}

export default App;
