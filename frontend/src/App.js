import React, { useState, useEffect } from 'react';
import socket from './socket';
import Auth from './Auth';
import Tournament from './Tournament';
import './App.css';

const categories = [
  "Toán học", "Lịch sử", "Địa lý", "Văn học", "Tin học", 
  "Khoa học", "Thể thao", "Âm nhạc", "Điện ảnh", "Tiếng Anh",
  "Du lịch", "Ẩm thực", "Động vật học", "Môi trường & Sinh thái", "Thiên Văn Học"
];

// --- HÀM PHÂN BẬC RANK ---
const getRankInfo = (totalPoint) => {
  if (totalPoint >= 2000) return { title: "CHÚA TỂ", color: "text-red-500", icon: "👑" };
  if (totalPoint >= 1000) return { title: "HUYỀN THOẠI", color: "text-yellow-400", icon: "🌟" };
  if (totalPoint >= 500) return { title: "CHỈ HUY", color: "text-blue-400", icon: "👨‍🚀" };
  if (totalPoint >= 200) return { title: "THÁM HIỂM", color: "text-green-400", icon: "🚀" };
  return { title: "TÂN BINH", color: "text-gray-400", icon: "🌑" };
};

function App() {
  // --- STATES ---
  const [user, setUser] = useState(localStorage.getItem('user') || null);
  const [myDisplayName, setMyDisplayName] = useState(localStorage.getItem('displayName') || '');
  const [totalPoint, setTotalPoint] = useState(parseInt(localStorage.getItem('totalPoint')) || 0);
  
  const [status, setStatus] = useState('HOME');
  const [showTournament, setShowTournament] = useState(false); // Tournament mode
  const [displayCat, setDisplayCat] = useState('');
  const [question, setQuestion] = useState(null);
  const [scores, setScores] = useState({});
  const [playerNames, setPlayerNames] = useState({});
  const [roomId, setRoomId] = useState('');
  const [timeLeft, setTimeLeft] = useState(10);
  
  const [starUsed, setStarUsed] = useState(false);
  const [isStarActive, setIsStarActive] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  
  const [showAuth, setShowAuth] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  const [myStreak, setMyStreak] = useState(0);
  const [showMeteors, setShowMeteors] = useState(false);
  const [opponentAnswered, setOpponentAnswered] = useState(false);

  // State hỗ trợ đổi tên
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  // --- AUTHENTICATE USER ON CONNECT ---
  useEffect(() => {
    const authenticate = () => {
      if (user && socket.connected) {
        console.log('[Auth] Authenticating user:', user);
        socket.emit('authenticate', { username: user });
      }
    };

    // Authenticate ngay khi component mount (nếu đã connected)
    authenticate();

    // Re-authenticate khi socket reconnect
    socket.on('connect', authenticate);

    return () => {
      socket.off('connect', authenticate);
    };
  }, [user]);

  // --- SOCKET EFFECTS ---
  useEffect(() => {
    socket.on('force_logout', (data) => {
      alert(data.message || 'Tài khoản của bạn đã đăng nhập ở nơi khác!');
      // Đăng xuất và quay về màn hình auth
      localStorage.removeItem('user');
      localStorage.removeItem('displayName');
      setUser(null);
      setShowAuth(true);
      setStatus('HOME');
    });

    socket.on('match_found', (data) => {
      setRoomId(data.roomId); setQuestion(data.question); setDisplayCat(data.category);
      setPlayerNames(data.names || {});setStatus('PLAYING'); setTimeLeft(10); 
      setStarUsed(false); setIsStarActive(false); setResultData(null); setIsLocked(false); setMyStreak(0);
      setOpponentAnswered(false);
    });

    socket.on('match_error', (data) => {
      alert(data.message || "Lỗi tìm trận!");
      setStatus('HOME');
    });

    socket.on('opponent_answered', (data) => {
      console.log('[1v1] Opponent answered:', data);
      setOpponentAnswered(true);
    });

    socket.on('both_answered', (data) => {
      console.log('[1v1] Both answered:', data);
      // Hiển thị kết quả của cả 2 người
      setResultData({
        correctIndex: data.correctIndex,
        answers: data.answers,
        scores: data.scores
      });
      setScores(data.scores);
      setIsLocked(true);
      setOpponentAnswered(false);
      
      // Cập nhật streak của mình
      if (data.streaks && data.streaks[socket.id]) {
        setMyStreak(data.streaks[socket.id]);
      }
    });

    // Keep old answer_result for backward compatibility (if needed)
    socket.on('answer_result', (data) => {
      setResultData(data); setScores(data.scores); setIsLocked(true);
      if (data.playerId === socket.id) setMyStreak(data.streak);
    });

    socket.on('next_question', (data) => {
      setQuestion(data.question); setScores(data.scores); setTimeLeft(10);
      setIsStarActive(false); setResultData(null); setIsLocked(false);
      setOpponentAnswered(false);
    });

    socket.on('game_over', (data) => { 
      // Nhận scores và details (chứa newTotalPoint) từ server
      setScores(data.scores); 
      setStatus('END');
      if (data.details && data.details[socket.id]) {
        const newTP = data.details[socket.id].newTotalPoint;
        setTotalPoint(newTP);
        localStorage.setItem('totalPoint', newTP);
      }
    });

    return () => socket.off();
  }, []);

  // --- LOGIC EFFECTS ---
  // Hiệu ứng bão sao băng khi streak >= 3
  useEffect(() => {
    if (myStreak >= 3) {
      setShowMeteors(true);
      const timer = setTimeout(() => setShowMeteors(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [myStreak]);

  // Đếm ngược thời gian
  useEffect(() => {
    if (status === 'PLAYING' && timeLeft > 0 && !isLocked) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (status === 'PLAYING' && timeLeft === 0 && !isLocked) {
      setIsLocked(true);
      socket.emit('timeout_answer', { roomId });
    }
  }, [timeLeft, status, isLocked, roomId]);

  // --- HANDLERS ---
  const handleLoginSuccess = (u, d, tp) => {
    setUser(u); setMyDisplayName(d || u); setTotalPoint(tp || 0);
    localStorage.setItem('user', u); localStorage.setItem('totalPoint', tp || 0);
    if (d) localStorage.setItem('displayName', d);
    setShowAuth(false);
  };

  const handleLogout = () => { localStorage.clear(); window.location.reload(); };

  const fetchLeaderboard = () => {
    fetch('http://localhost:4000/leaderboard')
      .then(r => r.json())
      .then(d => { setLeaderboard(d); setShowLeaderboard(true); })
      .catch(() => alert("Lỗi kết nối Server!"));
  };

  const updateDisplayName = async () => {
    if (!newName.trim()) return setIsEditingName(false);
    try {
      const res = await fetch('http://localhost:4000/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, newDisplayName: newName })
      });
      const data = await res.json();
      if (data.success) {
        setMyDisplayName(newName);
        localStorage.setItem('displayName', newName);
        setIsEditingName(false);
      }
    } catch (e) { alert("Lỗi cập nhật tên!"); }
  };

  const getOppName = () => {
    if (!playerNames || typeof playerNames !== 'object') return "Đối thủ";
    const oppId = Object.keys(playerNames).find(id => id !== socket.id);
    return playerNames[oppId] || "Đối thủ";
  };

  // --- RENDER ---
  return (
    <div className={`min-h-screen galaxy-bg text-white flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden ${timeLeft <= 3 && status === 'PLAYING' ? 'warning-pulse' : ''}`}>
      
      {/* 1. HIỆU ỨNG SAO BĂNG */}
      {showMeteors && (
        <div className="meteor-container">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="meteor" style={{ 
              left: `${Math.random() * 120 - 20}%`, 
              top: `${Math.random() * -30}%`, 
              animationDuration: `${0.4 + Math.random() * 0.6}s`, 
              animationDelay: `${Math.random() * 1.5}s`, 
              width: `${2 + Math.random() * 3}px`, 
              height: `${200 + Math.random() * 250}px` 
            }}></div>
          ))}
        </div>
      )}

      {/* 2. LỚP SAO NỀN */}
      <div className="stars-container"><div className="stars-small"></div><div className="stars-medium"></div></div>

      <div className="relative z-10 w-full flex flex-col items-center">
        <h1 className="text-7xl font-black mb-12 bg-clip-text text-transparent bg-gradient-to-b from-white via-purple-200 to-blue-400 italic tracking-tighter glow-title">ARENA QUIZ</h1>

        {/* 3. HEADER (THÔNG TIN USER & ĐỔI TÊN) */}
        {user && (
          <div className="absolute top-0 right-0 p-6 animate-fadeIn">
            <div className="glass-panel px-6 py-2 rounded-2xl flex items-center gap-4 border border-white/10 shadow-2xl">
              <div className="text-right">
                <p className={`text-[10px] font-black uppercase tracking-widest ${getRankInfo(totalPoint).color}`}>
                  {getRankInfo(totalPoint).icon} {getRankInfo(totalPoint).title}
                </p>
                
                {isEditingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="text" value={newName} 
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white outline-none w-24"
                      autoFocus
                    />
                    <button onClick={updateDisplayName} className="text-green-400 text-xs font-bold">OK</button>
                  </div>
                ) : (
                  <p 
                    onClick={() => {setNewName(myDisplayName); setIsEditingName(true);}} 
                    className="text-sm font-bold text-white cursor-pointer hover:text-blue-400 transition-colors"
                  >
                    {myDisplayName || user} <span className="text-[10px] opacity-50">✎</span>
                  </p>
                )}
                <p className="text-[9px] text-slate-500">EXP: {totalPoint}</p>
              </div>
              <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/30 text-red-500 p-2 rounded-xl transition-all border border-red-500/20 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* 4. MÀN HÌNH CHÍNH (HOME) */}
        {status === 'HOME' && !showTournament && (
          <div className="flex flex-col items-center mt-10">
            <button onClick={() => {
              if (!user) {
                alert('Hãy đăng nhập để bắt đầu chơi');
                setShowAuth(true);
              } else {
                setStatus('SELECT_CATEGORY');
              }
            }} className="group relative bg-blue-600 px-24 py-10 rounded-[2.5rem] font-black text-4xl hover:scale-105 transition-all shadow-[0_0_50px_rgba(37,99,235,0.4)] overflow-hidden">
              <span className="relative z-10">CHƠI NGAY</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
            
            <button 
              onClick={() => {
                if (!user) {
                  alert('Vui lòng đăng nhập để chơi Tournament!');
                  setShowAuth(true);
                } else {
                  setShowTournament(true);
                }
              }} 
              className="group relative bg-gradient-to-r from-yellow-500 to-orange-600 px-20 py-8 rounded-[2.5rem] font-black text-3xl hover:scale-105 transition-all shadow-[0_0_50px_rgba(234,179,8,0.4)] overflow-hidden mt-6"
            >
              <span className="relative z-10">🏆 TOURNAMENT</span>
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
            
            <button onClick={fetchLeaderboard} className="mt-8 text-yellow-400 font-black hover:text-yellow-200 tracking-widest text-xs uppercase transition-all">🏆 Bảng Xếp Hạng Cao Thủ</button>
            
            {showLeaderboard && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                <div className="glass-panel p-8 rounded-[3rem] w-full max-w-md border-t-yellow-400 border-t-4 animate-bounceIn shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black text-yellow-400 italic uppercase tracking-wider">🏆 TOP 10 CAO THỦ</h2>
                    <button onClick={() => setShowLeaderboard(false)} className="text-3xl hover:text-white transition-all hover:rotate-90 duration-300">✕</button>
                  </div>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {leaderboard.map((p, i) => {
                      const getMedalIcon = (rank) => {
                        if (rank === 0) return '🥇';
                        if (rank === 1) return '🥈';
                        if (rank === 2) return '🥉';
                        return null;
                      };
                      
                      const getRankBg = (rank) => {
                        if (rank === 0) return 'bg-gradient-to-r from-yellow-500/30 to-amber-500/30 border-2 border-yellow-400/50 shadow-lg shadow-yellow-500/20';
                        if (rank === 1) return 'bg-gradient-to-r from-gray-300/20 to-slate-400/20 border-2 border-gray-300/40 shadow-lg shadow-gray-400/10';
                        if (rank === 2) return 'bg-gradient-to-r from-orange-600/20 to-amber-700/20 border-2 border-orange-400/40 shadow-lg shadow-orange-500/10';
                        return 'bg-white/5 border border-white/10';
                      };
                      
                      const medal = getMedalIcon(i);
                      const bgClass = getRankBg(i);
                      
                      return (
                        <div 
                          key={i} 
                          className={`flex items-center justify-between p-4 rounded-2xl transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-xl ${bgClass}`}
                          style={{ 
                            animation: `fadeIn 0.4s ease-out ${i * 0.05}s both`,
                            transformOrigin: 'center'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {medal ? (
                              <span className="text-3xl animate-pulse" style={{ animationDuration: '2s' }}>{medal}</span>
                            ) : (
                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-black text-sm shadow-lg transition-transform duration-300 hover:scale-110">
                                {i + 1}
                              </span>
                            )}
                            <span className={`font-bold ${i < 3 ? 'text-lg' : 'text-base'} ${i === 0 ? 'text-yellow-300' : i === 1 ? 'text-gray-200' : i === 2 ? 'text-orange-300' : 'text-white'} transition-colors duration-300`}>
                              {p.display_name || p.username}
                            </span>
                          </div>
                          <span className={`font-black ${i < 3 ? 'text-xl' : 'text-lg'} ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-blue-400'} transition-all duration-300`}>
                            {p.high_score}<span className="text-sm ml-1">đ</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {!user && !showAuth && <button onClick={() => setShowAuth(true)} className="mt-12 text-slate-400 hover:text-blue-400 font-bold underline italic">Đăng nhập ngay</button>}
            {showAuth && <Auth onLoginSuccess={handleLoginSuccess} />}
          </div>
        )}

        {/* 5. CHỌN LĨNH VỰC */}
        {status === 'SELECT_CATEGORY' && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 w-full max-w-6xl p-4 animate-fadeIn">
            {categories.map(cat => (
              <button key={cat} onClick={() => { 
                if (!user) {
                  alert('Hãy đăng nhập để bắt đầu chơi');
                  setStatus('HOME');
                  setShowAuth(true);
                } else {
                  setDisplayCat(cat); 
                  socket.emit('find_match', { category: cat, username: user }); 
                  setStatus('WAITING');
                }
              }} 
              className="glass-panel p-10 rounded-3xl hover:border-purple-500 hover:scale-105 transition-all font-black text-xl shadow-lg active:scale-95">
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* 6. ĐỢI ĐỐI THỦ */}
        {status === 'WAITING' && <div className="text-center py-20 animate-pulse text-blue-400 font-black text-3xl tracking-widest uppercase">Đang tìm tín hiệu đối thủ...</div>}

        {/* 7. TRẬN ĐẤU (PLAYING) */}
        {status === 'PLAYING' && question && (
          <div className="w-full max-w-5xl animate-fadeIn">
            <div className="flex gap-8 mb-12 items-center">
              {/* Thông tin người chơi (You) */}
              <div className="flex-1 glass-panel p-8 rounded-[2.5rem] text-center border-l-4 border-purple-500 relative shadow-2xl">
                <span className="text-xs text-purple-400 font-black uppercase tracking-widest">You</span>
                <p className="text-xl font-bold truncate text-white">{myDisplayName || user}</p>
                <p className="text-6xl font-black my-2">{scores[socket.id] || 0}</p>
                {myStreak >= 2 && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-orange-600 px-4 py-1 rounded-full text-[10px] font-black italic animate-bounce shadow-lg">🔥 {myStreak} STREAK</div>}
              </div>

              {/* Thời gian & Ngôi sao hy vọng */}
              <div className="text-center min-w-[140px]">
                <p className="text-7xl font-black text-yellow-400 drop-shadow-[0_0_25px_rgba(234,179,8,0.5)]">{timeLeft}s</p>
                {!starUsed && (
                  <button 
                    onClick={() => !isLocked && setIsStarActive(!isStarActive)} 
                    className={`mt-4 px-6 py-2 rounded-full font-black text-[10px] transition-all ${isStarActive ? 'bg-yellow-400 text-black scale-110 shadow-[0_0_20px_yellow]' : 'bg-slate-800 text-gray-500 hover:bg-slate-700'}`}
                  >
                    🌟 NGÔI SAO HY VỌNG
                  </button>
                )}
              </div>

              {/* Thông tin đối thủ */}
              <div className="flex-1 glass-panel p-8 rounded-[2.5rem] text-center border-r-4 border-red-500 shadow-2xl">
                <span className="text-xs text-red-400 font-black uppercase tracking-widest">Opponent</span>
                <p className="text-xl font-bold truncate text-white">{getOppName()}</p>
                <p className="text-6xl font-black my-2">{playerNames && Object.keys(playerNames).length > 0 ? (scores[Object.keys(playerNames).find(id => id !== socket.id)] || 0) : 0}</p>
              </div>
            </div>

            {/* Câu hỏi & Đáp án */}
            <div className="glass-panel p-12 rounded-[3.5rem] relative shadow-2xl border-t border-white/5">
              <p className="text-center text-blue-400 font-black text-sm mb-6 uppercase tracking-widest">{displayCat}</p>
              
              {/* Thông báo đối thủ đã trả lời */}
              {opponentAnswered && !resultData && (
                <div className="text-center mb-4">
                  <p className="text-orange-400 font-bold text-sm animate-pulse">⚡ Đối thủ đã trả lời! Nhanh lên!</p>
                </div>
              )}
              
              <h2 className="text-3xl font-bold text-center mb-12 leading-relaxed text-white">{question.text}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {question.options.map((opt, i) => {
                  let c = "bg-white/5 border-white/10 hover:bg-white/10";
                  if (resultData) { 
                    // Nếu có resultData.answers (cả 2 người), highlight theo người chơi hiện tại
                    if (resultData.answers) {
                      const myAnswer = resultData.answers[socket.id];
                      if (i === resultData.correctIndex) {
                        c = "bg-green-600/60 border-green-400 shadow-[0_0_30px_green]"; 
                      } else if (myAnswer && i === myAnswer.answerIndex && !myAnswer.correct) {
                        c = "bg-red-600/60 border-red-400 shadow-[0_0_30px_red]"; 
                      }
                    } else {
                      // Fallback cho format cũ (answer_result)
                      if (i === resultData.correctIndex) c = "bg-green-600/60 border-green-400 shadow-[0_0_30px_green]"; 
                      else if (i === resultData.answerIndex && !resultData.isCorrect) c = "bg-red-600/60 border-red-400 shadow-[0_0_30px_red]"; 
                    }
                  }
                  return (
                    <button 
                      key={i} disabled={isLocked} 
                      onClick={() => { socket.emit('submit_answer', { roomId, answerIndex: i, isStar: isStarActive }); if(isStarActive) setStarUsed(true); }} 
                      className={`p-7 ${c} border-2 rounded-2xl text-left font-bold text-xl transition-all active:scale-95 flex items-center`}
                    >
                      <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-4 text-sm font-black">{String.fromCharCode(65+i)}</span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 8. KẾT THÚC (END) */}
        {status === 'END' && (
          <div className="text-center p-24 glass-panel rounded-[5rem] animate-fadeIn shadow-2xl">
            <h2 className={`text-9xl font-black mb-10 italic tracking-tighter drop-shadow-2xl ${scores[socket.id] > (playerNames && Object.keys(playerNames).length > 0 ? (scores[Object.keys(playerNames).find(id => id !== socket.id)] || 0) : 0) ? 'text-green-400' : 'text-red-500'}`}>
              {scores[socket.id] > (playerNames && Object.keys(playerNames).length > 0 ? (scores[Object.keys(playerNames).find(id => id !== socket.id)] || 0) : 0) ? 'VICTORY' : 'DEFEAT'}
            </h2>
            <div className="flex justify-center gap-16 mb-12">
              <div className="text-center">
                <p className="text-slate-500 text-xs font-black uppercase">Trận này</p>
                <p className="text-6xl font-black">+{scores[socket.id] || 0}</p>
              </div>
              <div className="text-center border-l border-white/10 pl-16">
                <p className="text-blue-400 text-xs font-black uppercase">Tổng EXP mới</p>
                <p className="text-6xl font-black text-blue-400">{totalPoint}</p>
              </div>
            </div>
            <button onClick={() => setStatus('HOME')} className="bg-white text-black px-20 py-6 rounded-2xl font-black text-2xl hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95">VỀ TRANG CHỦ</button>
          </div>
        )}

        {/* 9. TOURNAMENT MODE */}
        {showTournament && (
          <Tournament 
            username={user}
            displayName={myDisplayName}
            onBack={() => setShowTournament(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;