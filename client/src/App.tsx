import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import './App.css';

import batsmanImg from './assets/batsman.webp';
import bowlerImg from './assets/bowler.webp';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

function App() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [role, setRole] = useState(sessionStorage.getItem('role'));
  const [myTeamId, setMyTeamId] = useState(sessionStorage.getItem('teamId'));
  
  // Forms
  const [tName, setTName] = useState('');
  const [tBudget, setTBudget] = useState(0);
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState('Batsman');
  const [pSet] = useState('Set 1');
  const [pBase, setPBase] = useState(5000);
  const [newAuctionName, setNewAuctionName] = useState('');

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
        if (name) socket.emit('add_player', { id: (Date.now() + index).toString(), name, role: skill, setId: pSet, basePrice: pBase, mobile });
      });
      alert(`Processed ${excelData.length} players.`);
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const [loginStep, setLoginStep] = useState<'main' | 'auctions' | 'teams'>('main');
  const [adminView, setAdminView] = useState<'menu' | 'setup' | 'live' | 'report'>('menu');
  const [isManualMode, setIsManualMode] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);

  // Modals state
  const [showUnsoldModal, setShowUnsoldModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);

  // Local states for manual overrides
  const [localManualBid, setLocalManualBid] = useState<number>(0);
  const [localManualBidder, setLocalManualBidder] = useState<string | null>(null);

  useEffect(() => {
    if (data?.state) {
      setLocalManualBid(data.state.currentBid);
      setLocalManualBidder(data.state.bidderId);
    }
  }, [data?.state.currentBid, data?.state.bidderId]);

  const formatK = (num: number) => {
    if (num >= 10000000) return `₹${(num/10000000).toFixed(2)}Cr`;
    if (num >= 100000) return `₹${(num/100000).toFixed(2)}L`;
    if (num >= 1000) {
      const k = num / 1000;
      return `₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
    }
    return `₹${num}`;
  };

  const getPlayerImage = (p: any) => {
    if (p.role.toLowerCase() === 'batsman') return batsmanImg;
    if (p.role.toLowerCase() === 'bowler') return bowlerImg;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  };

  useEffect(() => {
    socket.on('sync_all', ({ auctions, activeAuction }) => {
      setAuctions(auctions);
      setData(activeAuction);
    });
    socket.on('auction_created', () => setAdminView('setup'));
    socket.on('auction_selected', () => setAdminView('menu'));
    socket.on('tick', (t) => setData((prev: any) => prev ? { ...prev, state: { ...prev.state, timer: t } } : null));
    socket.on('error_msg', (msg) => alert(msg));
    return () => { 
      socket.off('sync_all'); 
      socket.off('tick'); 
      socket.off('error_msg'); 
      socket.off('auction_created');
      socket.off('auction_selected');
    };
  }, []);

  const login = (r: string, tid?: string) => {
    setRole(r); sessionStorage.setItem('role', r);
    if (tid) { setMyTeamId(tid); sessionStorage.setItem('teamId', tid); }
  };

  const logout = () => { sessionStorage.clear(); window.location.reload(); };

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

  if (!role) return (
    <div className="login-screen">
      <h1>Welcome to Auction</h1>
      <div className="login-box">
        {loginStep === 'main' && (
          <div className="main-actions animate-fade-in">
            <button className="auction-btn" onClick={() => { setData(null); login('admin'); setAdminView('menu'); }}>
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
            <div className="search-box">
              <input 
                placeholder="Search Tournament..." 
                onChange={(e) => {
                  const val = e.target.value.toLowerCase();
                  const items = document.querySelectorAll('.auction-item-card');
                  items.forEach((item: any) => {
                    const name = item.querySelector('h4').innerText.toLowerCase();
                    item.style.display = name.includes(val) ? 'flex' : 'none';
                  });
                }}
              />
            </div>
            <div className="auction-list">
              {auctions.slice().sort((a,b) => Number(b.id) - Number(a.id)).map(a => (
                <button 
                  key={a.id} 
                  className={`auction-item-card ${a.isEnded ? 'completed' : 'live'}`} 
                  onClick={() => { 
                    socket.emit('select_auction', a.id); 
                    if (a.isEnded) {
                      setLoginStep('main'); 
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
            {(!data?.teams || data.teams.length === 0) && <p className="empty-teams">No teams created for this auction yet.</p>}
          </div>
        )}
      </div>
    </div>
  );

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
                    {auctions.length === 0 && <p className="empty-msg" style={{padding: '1rem'}}>No auctions found.</p>}
                </div>
            </div>
        </div>
    </div>
  );

  const { players, teams, state } = data;
  const currentP = players[state.currentPlayerIdx];

  // Report View - Only auto-show for non-admins if ended, or if admin explicitly selects report
  if (state.isEnded && role !== 'admin') {
    return (
      <div className="report-screen">
        <header>
          <h1>AUCTION COMPLETED</h1>
          <div className="header-actions">
            <button className="download-btn" onClick={downloadPDF}>Download PDF 📥</button>
            <button onClick={logout}>Logout</button>
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

  // Admin forced report view
  if (role === 'admin' && adminView === 'report') {
    return (
      <div className="report-screen">
        <header>
          <h1>{state.isEnded ? 'AUCTION COMPLETED' : 'AUCTION REPORT'}</h1>
          <div className="header-actions">
            <button className="download-btn" onClick={downloadPDF}>Download PDF 📥</button>
            <button onClick={() => setAdminView('menu')}>Back to Hub</button>
            <button onClick={logout}>Logout</button>
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

  // Auctioneer Menu
  if (role === 'admin' && adminView === 'menu') {
    return (
      <div className="admin-dashboard">
        <header>
          <div className="logo-section">
              <button className="back-hub-btn" onClick={() => setData(null)}>← HUB</button>
              <h1>{state.tournamentName}</h1>
          </div>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </header>
        <div className="dashboard-grid">
          {!state.isEnded && (
            <>
              <button className="dash-card" onClick={() => setAdminView('setup')}>
                <span className="dash-icon">⚙️</span><h2>SETUP</h2>
              </button>
              <button className="dash-card" onClick={() => setAdminView('live')}>
                <span className="dash-icon">⚡</span><h2>RESUME AUCTION</h2>
              </button>
              <button className="dash-card" onClick={() => { if(window.confirm("End this auction?")) socket.emit('mark_completed'); }}>
                <span className="dash-icon">🏁</span><h2>MARK COMPLETED</h2>
              </button>
            </>
          )}
          {state.isEnded && (
            <button className="dash-card" onClick={() => setAdminView('report')}>
              <span className="dash-icon">📊</span><h2>VIEW REPORT</h2>
            </button>
          )}
          <button className="dash-card warning" onClick={() => { if(window.confirm("ARE YOU SURE? This will permanently DELETE this tournament and all its data!")) { socket.emit('delete_auction', data.id); setData(null); } }}>
            <span className="dash-icon">🗑️</span><h2>DELETE TOURNAMENT</h2>
          </button>
        </div>
      </div>
    );
  }

  // Setup View
  if (role === 'admin' && adminView === 'setup') {
    return (
      <div className="setup-screen">
        <header>
          <button className="back-hub-btn" onClick={() => setAdminView('menu')}>← HUB</button>
          <h1>AUCTION SETUP</h1>
          <button className="start-now-btn" onClick={() => { if(players.length > 0) { socket.emit('next'); setAdminView('live'); } else { alert('Add at least one player'); } }}>
            START AUCTION 🚀
          </button>
        </header>

        <div className="setup-container">
          <div className="setup-forms">
            <div className="setup-card">
              <h3>Auction Settings</h3>
              <div className="form-group">
                <label style={{fontSize: '0.8rem', color: '#64748b'}}>Tournament Name</label>
                <input type="text" value={state.tournamentName} readOnly style={{opacity: 0.7}} />
                <label style={{fontSize: '0.8rem', color: '#64748b'}}>Players Per Team Squad</label>
                <select value={state.playersPerTeam} onChange={e => socket.emit('update_settings', { playersPerTeam: Number(e.target.value) })}>
                   {[5,6,7,8,9,10,11].map(n => <option key={n} value={n}>{n} Players</option>)}
                </select>
                <label style={{fontSize: '0.8rem', color: '#64748b'}}>Default Budget Per Team (₹)</label>
                <input type="number" value={state.budgetPerTeam} onChange={e => { socket.emit('update_settings', { budgetPerTeam: Number(e.target.value) }); setTBudget(Number(e.target.value)); }} />
              </div>
            </div>

            <div className="setup-card">
              <h3>{editingTeam ? 'Edit Team' : 'Add Team'}</h3>
              <div className="form-group">
                <input placeholder="Team Name" value={tName} onChange={e => setTName(e.target.value)} />
                <input type="number" placeholder="Budget" value={tBudget} readOnly style={{opacity: 0.7, cursor: 'not-allowed'}} />
                {editingTeam ? (
                  <div className="edit-actions">
                    <button onClick={() => { socket.emit('edit_team', { id: editingTeam.id, name: tName, initialBudget: tBudget }); setEditingTeam(null); setTName(''); setTBudget(0); }}>Save</button>
                    <button className="cancel-btn" onClick={() => { setEditingTeam(null); setTName(''); setTBudget(0); }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { socket.emit('add_team', { id: Date.now().toString(), name: tName, initialBudget: tBudget }); setTName(''); }}>Add Team</button>
                )}
              </div>
            </div>

            <div className="setup-card">
              <h3>Add Player</h3>
              <div className="form-group">
                <div className="bulk-upload-section">
                  <label style={{fontSize: '0.8rem', color: '#64748b'}}>Bulk Upload (Excel)</label>
                  <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} style={{fontSize: '0.8rem', padding: '0.4rem'}} />
                </div>
                <hr style={{border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0.5rem 0'}} />
                <input placeholder="Player Name" value={pName} onChange={e => setPName(e.target.value)} />
                <select value={pRole} onChange={e => setPRole(e.target.value)}>
                  <option>Batsman</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option>
                </select>
                <input placeholder="Base Price" type="number" value={pBase} onChange={e => setPBase(Number(e.target.value))} />
                <button onClick={() => { socket.emit('add_player', { id: Date.now().toString(), name: pName, role: pRole, setId: pSet, basePrice: pBase }); setPName(''); }}>Add Player</button>
              </div>
            </div>
          </div>

          <div className="setup-lists">
            <div className="list-section">
              <h3>Added Teams ({teams.length})</h3>
              <div className="scroll-list">
                {teams.map((t:any) => (
                  <div key={t.id} className="list-item">
                    <div className="item-info"><span>{t.name}</span><b>{formatK(t.budget)}</b></div>
                    <button className="edit-icon-btn" onClick={() => { setEditingTeam(t); setTName(t.name); setTBudget(t.initialBudget); }}>✏️</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="list-section">
              <h3>Added Players ({players.length})</h3>
              <div className="scroll-list">
                {players.map((p:any) => (
                  <div key={p.id} className="list-item">
                    <span>{p.name} ({p.role})</span>
                    <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}><b>{formatK(p.basePrice)}</b><button className="remove-btn-icon" onClick={() => { if(confirm(`Remove ${p.name}?`)) socket.emit('remove_player', { id: p.id }); }}>🗑️</button></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
          {role === 'admin' && <button className="back-hub-btn" onClick={() => setAdminView('menu')}>← HUB</button>}
          <h1>{role === 'admin' ? `${state.tournamentName} - LIVE` : `${state.tournamentName} - ${teams.find((t:any)=>t.id === myTeamId)?.name}`}</h1>
        </div>
        <div className="header-right">
          {role === 'admin' && adminView === 'live' && (<button className={`manual-toggle ${isManualMode ? 'active' : ''}`} onClick={() => setIsManualMode(!isManualMode)}>{isManualMode ? 'EXIT MANUAL MODE' : 'MANUAL OVERRIDE'}</button>)}
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <main>
        <div className="auction-main">
          {currentP ? (
            <div className={`live-card ${currentP.role.toLowerCase().replace('-', '')}`}>
              <div className="card-header">
                <div className="set-tag">{currentP.setId}</div>
                <div className={`modern-timer ${state.timer < 10 ? 'critical' : ''}`}><svg className="timer-svg" viewBox="0 0 100 100"><circle className="timer-bg" cx="50" cy="50" r="45" /><circle className="timer-progress" cx="50" cy="50" r="45" style={{ strokeDashoffset: (283 - (283 * state.timer) / 30) }} /></svg><div className="timer-value">{state.timer}</div></div>
              </div>
              <div className="player-profile"><div className={`player-avatar role-anim-${currentP.role.toLowerCase().replace('-', '')}`}><img src={getPlayerImage(currentP)} alt={currentP.name} className="avatar-img" /></div><div className="player-title"><h1>{currentP.name}</h1><span className={`role-badge ${currentP.role.toLowerCase().replace('-', '')}`}>{currentP.role}</span></div></div>
              <hr className="divider" /><div className="bid-dashboard"><div className="stat-box base"><label>BASE PRICE</label><div className="val">{formatK(currentP.basePrice)}</div></div>{isManualMode ? (<div className="manual-bid-form"><div className="stat-box highlight manual"><label>MANUAL BID (₹)</label><input type="number" value={localManualBid} className="manual-input" onChange={(e) => setLocalManualBid(Number(e.target.value))} onBlur={(e) => socket.emit('manual_bid_update', { amount: Number(e.target.value), bidderId: localManualBidder })} /></div><div className="stat-box manual"><label>MANUAL BIDDER</label><select value={localManualBidder || ""} className="manual-select" onChange={(e) => { const val = e.target.value; const nextBidder = val === "" ? null : val; setLocalManualBidder(nextBidder); socket.emit('manual_bid_update', { amount: localManualBid, bidderId: nextBidder }); }}><option value="">None</option>{teams.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div></div>) : (<><div className="stat-box highlight"><label>CURRENT BID</label><div className="val">{formatK(state.currentBid)}</div></div><div className="stat-box bidder"><label>CURRENT BIDDER</label><div className="val">{teams.find((t:any)=>t.id === state.bidderId)?.name || 'Waiting...'}</div></div></>)}</div>
              {role === 'team' && currentP.status === 'Available' && (<div className="max-bid-info">{(() => { const myTeam = teams.find((t:any) => t.id === myTeamId); if (!myTeam) return null; const MIN_BASE = 5000; const needed = state.playersPerTeam - (myTeam.squad.length + 1); const reserve = needed * MIN_BASE; const maxAllowed = myTeam.budget - reserve; return (<span>Max Bid Allowed: <b>{formatK(maxAllowed)}</b> <small>(Reserving {formatK(reserve)} for {needed} more players)</small></span>); })()}</div>)}
              {isManualMode && role === 'admin' && (<div className="manual-actions-row"><button className="force-sell-btn" onClick={() => { if (!localManualBidder) return alert("Please select a bidder first"); socket.emit('force_sell', { amount: localManualBid, bidderId: localManualBidder }); }}>SELL NOW ✅</button><button className="force-unsold-btn" onClick={() => { socket.emit('manual_unsold'); }}>MARK UNSOLD ❌</button></div>)}
              {role === 'team' && currentP.status === 'Available' && (<div className="bid-controls">{!state.bidderId && (<button className="base-bid-btn" onClick={() => { const myTeam = teams.find((t:any) => t.id === myTeamId); if (myTeam && myTeam.squad.length >= state.playersPerTeam) return alert(`Squad limit of ${state.playersPerTeam} reached!`); if (!myTeamId) return alert("Error: Team ID not found."); socket.emit('bid', { teamId: myTeamId, amount: currentP.basePrice }); }}>BID BASE: {formatK(currentP.basePrice)}</button>)}<button onClick={() => { const myTeam = teams.find((t:any) => t.id === myTeamId); if (myTeam && myTeam.squad.length >= state.playersPerTeam) return alert(`Squad limit reached!`); if (!myTeamId) return alert("Error: Team ID not found."); socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 5000 }); }}>+5k</button><button onClick={() => { const myTeam = teams.find((t:any) => t.id === myTeamId); if (myTeam && myTeam.squad.length >= state.playersPerTeam) return alert(`Squad limit reached!`); if (!myTeamId) return alert("Error: Team ID not found."); socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 10000 }); }}>+10k</button><button onClick={() => { const myTeam = teams.find((t:any) => t.id === myTeamId); if (myTeam && myTeam.squad.length >= state.playersPerTeam) return alert(`Squad limit reached!`); if (!myTeamId) return alert("Error: Team ID not found."); socket.emit('bid', { teamId: myTeamId, amount: state.currentBid + 15000 }); }}>+15k</button></div>)}
            </div>
          ) : (
            <div className="empty-state"><h1>{players.length > 0 ? 'Wait for Auctioneer to start' : 'Welcome to the Auction'}</h1>{role === 'admin' && <p>Go to Hub to manage players and teams.</p>}</div>
          )}
          {role === 'admin' && currentP && (<div className="admin-controls"><button onClick={() => socket.emit('next')}>Next Player</button><button onClick={() => socket.emit('start')} className="start-btn">Start Bidding</button></div>)}
        </div>
        <div className="sidebar">
          <div className="status-panel"><h3>Quick View</h3><div className="utility-grid"><button className="sidebar-btn sold" onClick={() => setShowSoldModal(true)}>SOLD PLAYERS</button><button className="sidebar-btn unsold" onClick={() => setShowUnsoldModal(true)}>UNSOLD LIST</button><button className="sidebar-btn rosters" onClick={() => setShowRosterModal(true)}>TEAM ROSTERS</button><button className="sidebar-btn upcoming" onClick={() => setShowUpcomingModal(true)}>UPCOMING</button></div></div>
          <div className="status-panel"><h3>Current Team Status</h3><div className="sold-players-list">{teams.map((t: any) => (<div key={t.id} className="sold-item"><div style={{display: 'flex', flexDirection: 'column'}}><span>{t.name}</span><small style={{fontSize: '0.7rem', color: t.squad.length >= state.playersPerTeam ? '#ef4444' : '#64748b'}}>Squad: {t.squad.length}/{state.playersPerTeam}</small></div><b>{formatK(t.budget)}</b></div>))}</div></div>
        </div>
      </main>
    </div>
  );
}

export default App;
