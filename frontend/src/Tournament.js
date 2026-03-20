import React, { useState, useEffect } from 'react';
import socket from './socket';

function Tournament({ username, displayName, onBack }) {
    const [view, setView] = useState('menu');
    const [tournamentData, setTournamentData] = useState(null);
    
    const [tournamentName, setTournamentName] = useState('');
    const [hostIsPlayer, setHostIsPlayer] = useState(false);
    const [questionSource, setQuestionSource] = useState('system');
    const [selectedCategory, setSelectedCategory] = useState('Toán học');
    const [customQuestions, setCustomQuestions] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState({
        question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 0
    });
    const [quickCategory, setQuickCategory] = useState('Toán học'); // Category để lấy câu ngẫu nhiên

    const [joinCode, setJoinCode] = useState('');
    const [participants, setParticipants] = useState([]);
    const [gameQuestion, setGameQuestion] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isWarmup, setIsWarmup] = useState(false);
    const [willEliminate, setWillEliminate] = useState(false);
    const [isFinalPhase, setIsFinalPhase] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);
    const [eliminatedPlayer, setEliminatedPlayer] = useState(null);
    const [finalStandings, setFinalStandings] = useState(null);
    const [answerStartTime, setAnswerStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(10);
    const [timeLimit, setTimeLimit] = useState(10);
    const [isEliminated, setIsEliminated] = useState(false);
    const [correctAnswer, setCorrectAnswer] = useState(null);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [isSpectator, setIsSpectator] = useState(false);

    const categories = [
        "Toán học", "Lịch sử", "Địa lý", "Văn học", "Tin học", 
        "Khoa học", "Thể thao", "Âm nhạc", "Điện ảnh", "Tiếng Anh",
        "Du lịch", "Ẩm thực", "Động vật học", "Môi trường & Sinh thái", "Thiên Văn Học"
    ];

    useEffect(() => {
        socket.on('force_logout', (data) => {
            alert(data.message || 'Tài khoản của bạn đã đăng nhập ở nơi khác!');
            // Quay về trang chủ
            onBack();
        });

        socket.on('tournament_joined', (data) => {
            setTournamentData(data.tournament);
            setView('lobby');
            // Host không tham gia thi đấu -> chế độ xem
            if (data.is_spectator) {
                setIsSpectator(true);
            }
        });

        socket.on('tournament_updated', (data) => {
            setParticipants(data.participants);
        });

        socket.on('tournament_started', (data) => {
            setView('playing');
            setGameQuestion(data.question);
            setIsWarmup(data.is_warmup);
            setSelectedAnswer(null);
            setAnswerStartTime(Date.now());
            setTimeLimit(data.time_limit || 10);
            setTimeLeft(data.time_limit || 10);
            setCorrectAnswer(null);
            setShowLeaderboard(false);
        });

        socket.on('next_tournament_question', (data) => {
            setGameQuestion(data.question);
            setIsWarmup(data.is_warmup);
            setWillEliminate(data.will_eliminate);
            setIsFinalPhase(data.is_final_phase);
            setSelectedAnswer(null);
            setEliminatedPlayer(null);
            setAnswerStartTime(Date.now());
            setTimeLimit(data.time_limit || 10);
            setTimeLeft(data.time_limit || 10);
            setCorrectAnswer(null);
            setShowLeaderboard(false);
        });

        socket.on('question_results', (data) => {
            setLeaderboard(data.leaderboard);
            setCorrectAnswer(data.correct_answer);
            setShowLeaderboard(true);
        });

        socket.on('player_eliminated', (data) => {
            setEliminatedPlayer(data);
            if (data.username === username) {
                setIsEliminated(true);
            }
        });

        socket.on('tournament_finished', (data) => {
            setFinalStandings(data.standings);
            setView('result');
        });

        socket.on('tournament_error', (data) => {
            alert(data.message);
        });

        return () => {
            ['force_logout','tournament_joined','tournament_updated','tournament_started','next_tournament_question',
             'question_results','player_eliminated','tournament_finished','tournament_error'
            ].forEach(e => socket.off(e));
        };
    }, []);

    // Đếm ngược thời gian - giống 1v1
    useEffect(() => {
        if (view === 'playing' && timeLeft > 0 && selectedAnswer === null) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft, view, selectedAnswer]);

    // Auto-hide leaderboard sau 3.5s
    useEffect(() => {
        if (showLeaderboard) {
            const timer = setTimeout(() => setShowLeaderboard(false), 3500);
            return () => clearTimeout(timer);
        }
    }, [showLeaderboard]);

    // Auto-dismiss eliminated overlay sau 3s
    useEffect(() => {
        if (eliminatedPlayer) {
            const timer = setTimeout(() => setEliminatedPlayer(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [eliminatedPlayer]);

    const handleCreateTournament = async () => {
        if (!tournamentName.trim()) return alert('Vui lòng nhập tên giải đấu');
        if (questionSource === 'custom' && customQuestions.length < 10) return alert('Cần ít nhất 10 câu hỏi tự tạo');

        try {
            const res = await fetch('http://localhost:4000/tournament/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tournament_name: tournamentName,
                    host_username: username,
                    host_is_player: hostIsPlayer,
                    question_source: questionSource,
                    category: questionSource === 'system' ? selectedCategory : null,
                    custom_questions: questionSource === 'custom' ? customQuestions : []
                })
            });
            const data = await res.json();
            if (data.success) {
                // Chỉ join tournament nếu host muốn tham gia thi đấu
                if (hostIsPlayer) {
                    socket.emit('join_tournament', { tournament_code: data.tournament_code, username });
                } else {
                    // Host chỉ xem, không tham gia thi đấu
                    socket.emit('spectate_tournament', { tournament_code: data.tournament_code, username });
                }
            } else {
                alert(data.message);
            }
        } catch (err) {
            alert('Lỗi tạo giải đấu');
        }
    };

    const handleAddQuestion = () => {
        if (!currentQuestion.question_text.trim() || !currentQuestion.option_a.trim() ||
            !currentQuestion.option_b.trim() || !currentQuestion.option_c.trim() || !currentQuestion.option_d.trim()) {
            return alert('Vui lòng nhập đầy đủ');
        }
        setCustomQuestions([...customQuestions, { ...currentQuestion }]);
        setCurrentQuestion({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 0 });
    };

    const handleLoadRandomQuestions = async () => {
        try {
            const response = await fetch('http://localhost:4000/tournament/random-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: quickCategory })
            });

            const data = await response.json();

            if (data.success && data.questions.length > 0) {
                setCustomQuestions(data.questions);
                alert(`Đã tải ${data.questions.length} câu hỏi từ chủ đề "${quickCategory}"`);
            } else {
                alert('Không tìm thấy câu hỏi cho chủ đề này');
            }
        } catch (error) {
            console.error('Lỗi tải câu hỏi:', error);
            alert('Lỗi kết nối đến server');
        }
    };

    const handleJoinTournament = () => {
        if (!joinCode.trim()) return alert('Vui lòng nhập mã giải đấu');
        socket.emit('join_tournament', { tournament_code: joinCode.toUpperCase(), username });
    };

    const handleStartTournament = () => {
        if (participants.length < 2) return alert('Cần ít nhất 2 người chơi');
        socket.emit('start_tournament', { tournament_code: tournamentData.tournament_code });
    };

    const handleAnswerClick = (index) => {
        if (selectedAnswer !== null || isEliminated || isSpectator) return;
        const timeTaken = Date.now() - answerStartTime;
        setSelectedAnswer(index);
        socket.emit('submit_tournament_answer', {
            tournament_code: tournamentData.tournament_code,
            answer_index: index,
            time_taken: timeTaken
        });
    };

    const handleLeave = () => {
        socket.emit('leave_tournament');
        setView('menu');
        setTournamentData(null);
        setParticipants([]);
    };

    /* ============ MENU ============ */
    if (view === 'menu') {
        return (
            <div className="flex flex-col items-center gap-6 animate-fadeIn">
                <h1 className="text-5xl font-black text-yellow-400 italic tracking-tight drop-shadow-2xl">
                    🏆 TOURNAMENT
                </h1>
                <p className="text-slate-400 text-sm">Tạo hoặc tham gia giải đấu 2-10 người</p>

                <div className="flex gap-4 mt-4">
                    <button onClick={() => setView('create')}
                        className="glass-panel px-10 py-5 rounded-2xl font-black text-xl hover:border-purple-500 hover:scale-105 transition-all active:scale-95">
                        🎮 Tạo giải đấu
                    </button>
                    <button onClick={() => setView('join')}
                        className="glass-panel px-10 py-5 rounded-2xl font-black text-xl hover:border-blue-500 hover:scale-105 transition-all active:scale-95">
                        🚀 Tham gia
                    </button>
                </div>

                <button onClick={onBack}
                    className="mt-4 text-slate-500 hover:text-white font-bold underline italic text-sm transition-colors">
                    ← Quay lại trang chủ
                </button>
            </div>
        );
    }

    /* ============ CREATE ============ */
    if (view === 'create') {
        return (
            <div className="w-full max-w-2xl animate-fadeIn">
                <div className="glass-panel p-10 rounded-[3rem] shadow-2xl">
                    <h2 className="text-3xl font-black text-yellow-400 italic text-center mb-8">TẠO GIẢI ĐẤU</h2>

                    {/* Tên giải đấu */}
                    <input type="text" placeholder="Tên giải đấu..." value={tournamentName}
                        onChange={(e) => setTournamentName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-xl font-bold text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition-all mb-4" />

                    {/* Host tham gia */}
                    <label className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all mb-4">
                        <input type="checkbox" checked={hostIsPlayer} onChange={(e) => setHostIsPlayer(e.target.checked)}
                            className="w-5 h-5 accent-purple-500" />
                        <span className="font-bold text-white">Host cũng tham gia thi đấu</span>
                    </label>

                    {/* Nguồn câu hỏi */}
                    <div className="bg-white/5 rounded-2xl p-5 mb-4">
                        <p className="text-xs text-blue-400 font-black uppercase tracking-widest mb-4">Nguồn câu hỏi</p>

                        <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all mb-2">
                            <input type="radio" value="system" checked={questionSource === 'system'}
                                onChange={(e) => setQuestionSource(e.target.value)} className="w-4 h-4 accent-purple-500" />
                            <span className="font-bold text-white">Từ hệ thống (30 câu)</span>
                        </label>

                        {questionSource === 'system' && (
                            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-white font-bold mt-2 focus:border-purple-500 focus:outline-none">
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        )}

                        <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all mt-2">
                            <input type="radio" value="custom" checked={questionSource === 'custom'}
                                onChange={(e) => setQuestionSource(e.target.value)} className="w-4 h-4 accent-purple-500" />
                            <span className="font-bold text-white">Tự tạo câu hỏi (min 10, khuyến nghị 30)</span>
                        </label>
                    </div>

                    {/* Custom questions */}
                    {questionSource === 'custom' && (
                        <div className="bg-white/5 rounded-2xl p-5 mb-4">
                            <p className="text-xs text-green-400 font-black uppercase tracking-widest mb-3">
                                Thêm câu hỏi ({customQuestions.length} câu)
                            </p>

                            {/* Quick load từ chủ đề */}
                            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-4 mb-4">
                                <p className="text-xs text-blue-300 font-bold mb-2">⚡ LẤY NHANH 10 CÂU TỪ CHỦ ĐỀ</p>
                                <div className="flex gap-2">
                                    <select 
                                        value={quickCategory}
                                        onChange={(e) => setQuickCategory(e.target.value)}
                                        className="flex-1 bg-slate-800 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-blue-500 focus:outline-none">
                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                    <button 
                                        onClick={handleLoadRandomQuestions}
                                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-black transition-all active:scale-95 shadow-lg whitespace-nowrap">
                                        🎲 Lấy 10 câu
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-4"></div>

                            <p className="text-xs text-slate-400 font-bold mb-3">HOẶC TỰ TẠO CÂU HỎI</p>

                            <input type="text" placeholder="Câu hỏi..." value={currentQuestion.question_text}
                                onChange={(e) => setCurrentQuestion({...currentQuestion, question_text: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none mb-2" />
                            <div className="grid grid-cols-2 gap-2">
                                {['option_a', 'option_b', 'option_c', 'option_d'].map((key, i) => (
                                    <input key={key} type="text" placeholder={`Đáp án ${String.fromCharCode(65 + i)}`}
                                        value={currentQuestion[key]}
                                        onChange={(e) => setCurrentQuestion({...currentQuestion, [key]: e.target.value})}
                                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none" />
                                ))}
                            </div>
                            <select value={currentQuestion.correct_option}
                                onChange={(e) => setCurrentQuestion({...currentQuestion, correct_option: parseInt(e.target.value)})}
                                className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-white font-bold mt-2 focus:outline-none">
                                <option value={0}>Đáp án đúng: A</option>
                                <option value={1}>Đáp án đúng: B</option>
                                <option value={2}>Đáp án đúng: C</option>
                                <option value={3}>Đáp án đúng: D</option>
                            </select>
                            <button onClick={handleAddQuestion}
                                className="mt-3 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-xl font-black transition-all active:scale-95">
                                + Thêm câu hỏi
                            </button>

                            {customQuestions.length > 0 && (
                                <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
                                    {customQuestions.map((q, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white/5 p-2 rounded-lg text-sm">
                                            <span className="truncate flex-1 text-slate-300">Câu {idx + 1}: {q.question_text}</span>
                                            <button onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== idx))}
                                                className="text-red-400 hover:text-red-300 ml-2 font-black">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-4 justify-center mt-6">
                        <button onClick={handleCreateTournament}
                            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-10 py-4 rounded-2xl font-black text-xl transition-all active:scale-95 shadow-xl">
                            🏆 Tạo giải đấu
                        </button>
                        <button onClick={() => setView('menu')}
                            className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold transition-all active:scale-95">
                            Hủy
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ============ JOIN ============ */
    if (view === 'join') {
        return (
            <div className="animate-fadeIn">
                <div className="glass-panel p-10 rounded-[3rem] shadow-2xl text-center min-w-[400px]">
                    <h2 className="text-3xl font-black text-blue-400 italic mb-6">THAM GIA GIẢI ĐẤU</h2>
                    <input type="text" placeholder="Nhập mã 6 ký tự" value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-5 text-3xl font-black text-center text-yellow-400 tracking-[0.5em] placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-all uppercase" />
                    <div className="flex gap-4 justify-center mt-6">
                        <button onClick={handleJoinTournament}
                            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-10 py-4 rounded-2xl font-black text-xl transition-all active:scale-95 shadow-xl">
                            🚀 Tham gia
                        </button>
                        <button onClick={() => setView('menu')}
                            className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold transition-all active:scale-95">
                            Hủy
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ============ LOBBY ============ */
    if (view === 'lobby') {
        const isHost = tournamentData?.host_username === username;
        
        return (
            <div className="w-full max-w-2xl animate-fadeIn">
                <div className="glass-panel p-10 rounded-[3rem] shadow-2xl">
                    <h2 className="text-3xl font-black text-yellow-400 italic text-center mb-2">
                        {tournamentData?.tournament_name}
                    </h2>

                    {/* Banner spectator cho host */}
                    {isSpectator && (
                        <div className="text-center mb-4 py-3 px-6 bg-slate-700/50 border border-slate-500/30 rounded-2xl">
                            <p className="text-xl font-black text-slate-400">👁️ BẠN Ở CHẾ ĐỘ XEM</p>
                            <p className="text-xs text-slate-500 mt-1">Bạn sẽ không tham gia thi đấu</p>
                        </div>
                    )}

                    {/* Mã phòng */}
                    <div className="text-center my-6 bg-white/5 p-4 rounded-2xl">
                        <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Mã phòng</p>
                        <p className="text-4xl font-black text-yellow-400 tracking-[0.4em]">
                            {tournamentData?.tournament_code}
                        </p>
                    </div>

                    {/* Danh sách người chơi */}
                    <div className="mb-6">
                        <p className="text-xs text-blue-400 font-black uppercase tracking-widest mb-3">
                            Người chơi ({participants.length}/10)
                        </p>
                        <div className="space-y-2">
                            {participants.map(p => (
                                <div key={p.username}
                                    className={`flex items-center justify-between p-4 rounded-2xl transition-all
                                        ${p.username === username
                                            ? 'bg-purple-500/20 border border-purple-500/30'
                                            : 'bg-white/5'}`}>
                                    <span className="font-bold text-white">
                                        {p.display_name} {p.username === tournamentData?.host_username && '👑'}
                                    </span>
                                    {p.username === username && (
                                        <span className="text-xs text-purple-400 font-black">YOU</span>
                                    )}
                                </div>
                            ))}
                            {isSpectator && (
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-700/30 border border-slate-500/20">
                                    <span className="font-bold text-slate-400">
                                        {displayName || username} 👑 (Spectator)
                                    </span>
                                    <span className="text-xs text-slate-500 font-black">YOU</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 justify-center">
                        {isHost && (
                            <button onClick={handleStartTournament} disabled={participants.length < 2}
                                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-10 py-4 rounded-2xl font-black text-xl transition-all active:scale-95 shadow-xl">
                                ⚡ Bắt đầu
                            </button>
                        )}
                        <button onClick={handleLeave}
                            className="bg-white/10 hover:bg-red-600/50 text-white px-8 py-4 rounded-2xl font-bold transition-all active:scale-95">
                            Rời phòng
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ============ PLAYING ============ */
    if (view === 'playing') {
        const isWarning = timeLeft <= 3 && selectedAnswer === null && !isEliminated && !isSpectator;
        
        return (
            <div className={`w-full max-w-5xl animate-fadeIn ${isWarning ? 'warning-pulse' : ''}`}>
                {/* Banner: Host spectator mode */}
                {isSpectator && (
                    <div className="text-center mb-4 py-4 px-6 bg-slate-700/50 border border-slate-500/30 rounded-2xl">
                        <p className="text-2xl font-black text-slate-400">👁️ CHẾ ĐỘ XEM (HOST)</p>
                        <p className="text-sm text-slate-500 mt-1">
                            {correctAnswer !== null 
                                ? "✅ Đáp án đúng đã được hiển thị" 
                                : "Bạn đang xem trận đấu"}
                        </p>
                    </div>
                )}
                
                {/* Banner: Spectator mode khi bị loại */}
                {!isSpectator && isEliminated && (
                    <div className="text-center mb-4 py-4 px-6 bg-slate-700/50 border border-slate-500/30 rounded-2xl">
                        <p className="text-2xl font-black text-slate-400">👁️ CHẾ ĐỘ XEM</p>
                        <p className="text-sm text-slate-500 mt-1">
                            {correctAnswer !== null 
                                ? "✅ Đáp án đúng đã được hiển thị" 
                                : "Bạn đã bị loại – đang xem trận đấu"}
                        </p>
                    </div>
                )}

                {/* Banner: Warmup / Elimination / Final */}
                {!isEliminated && !isEliminated && isWarmup && (
                    <div className="text-center mb-4 py-3 px-6 bg-cyan-600/30 border border-cyan-400/30 rounded-2xl font-black text-cyan-300 animate-pulse">
                        💡 Câu làm quen – Chưa loại người
                    </div>
                )}
                {!isEliminated && willEliminate && !isFinalPhase && (
                    <div className="text-center mb-4 py-3 px-6 bg-red-600/30 border border-red-400/30 rounded-2xl font-black text-red-300 animate-pulse">
                        ⚠️ Câu này sẽ có LOẠI!
                    </div>
                )}
                {!isEliminated && isFinalPhase && (
                    <div className="text-center mb-4 py-3 px-6 bg-yellow-600/30 border border-yellow-400/30 rounded-2xl font-black text-yellow-300 text-2xl">
                        🏆 CHUNG KẾT! 2 người chơi cuối cùng
                    </div>
                )}

                {/* Eliminated overlay */}
                {eliminatedPlayer && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
                        <div className="glass-panel p-10 rounded-[3rem] text-center animate-bounceIn shadow-2xl border-t-2 border-red-500">
                            <p className="text-6xl mb-4">❌</p>
                            <p className="text-2xl font-black text-red-400">
                                {eliminatedPlayer.display_name} đã bị loại!
                            </p>
                            <p className="text-slate-400 mt-2">
                                Điểm cuối: <span className="text-white font-black">{eliminatedPlayer.final_score}</span>
                            </p>
                            <p className="text-slate-400">
                                Còn lại: <span className="text-yellow-400 font-black">{eliminatedPlayer.remaining_players}</span> người
                            </p>
                        </div>
                    </div>
                )}

                {/* Leaderboard - quiz.com style, hiện 3.5s rồi ẩn */}
                {showLeaderboard && leaderboard.length > 0 && (
                    <div className="glass-panel rounded-3xl p-6 mb-6 shadow-2xl animate-fadeIn"
                         style={{ animation: 'fadeIn 0.4s ease-out, fadeOut 0.5s ease-in 3s forwards' }}>
                        <p className="text-xs text-blue-400 font-black uppercase tracking-widest mb-4 text-center">Bảng xếp hạng</p>
                        <div className="space-y-2">
                            {leaderboard.map(p => {
                                const maxScore = leaderboard[0]?.score || 1;
                                const barWidth = maxScore > 0 ? Math.max((p.score / maxScore) * 100, 8) : 8;
                                const isMe = p.username === username;
                                const rankColors = {
                                    1: 'from-yellow-500 to-amber-400',
                                    2: 'from-slate-300 to-slate-400',
                                    3: 'from-orange-600 to-amber-700'
                                };
                                const rankEmoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
                                const barColor = rankColors[p.rank] || 'from-purple-600 to-blue-600';

                                return (
                                    <div key={p.username}
                                        className={`relative flex items-center gap-3 p-3 rounded-xl transition-all ${
                                            isMe ? 'bg-white/10 ring-2 ring-purple-500/50 scale-[1.02]' : ''
                                        }`}>
                                        {/* Rank */}
                                        <div className="w-8 text-center flex-shrink-0">
                                            {rankEmoji[p.rank]
                                                ? <span className="text-xl">{rankEmoji[p.rank]}</span>
                                                : <span className="text-sm font-black text-slate-500">{p.rank}</span>
                                            }
                                        </div>

                                        {/* Name + Score bar */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`font-bold text-sm truncate ${isMe ? 'text-purple-300' : 'text-white'}`}>
                                                    {p.display_name} {isMe && '(Bạn)'}
                                                </span>
                                                <span className="font-black text-yellow-400 text-sm ml-2 flex-shrink-0">
                                                    {p.score}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                                                <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
                                                    style={{ width: `${barWidth}%` }} />
                                            </div>
                                        </div>

                                        {/* Answer indicator */}
                                        <div className="w-6 text-center flex-shrink-0">
                                            {p.last_answer !== undefined && (
                                                <span className={`text-lg ${p.last_answer ? 'text-green-400' : 'text-red-400'}`}>
                                                    {p.last_answer ? '✓' : '✗'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Timer */}
                <div className="text-center mb-6">
                    {correctAnswer !== null && !selectedAnswer && (
                        <p className="text-orange-400 font-bold text-sm mb-2">
                            Bạn không trả lời - xem đáp án đúng bên dưới
                        </p>
                    )}
                    <p className={`text-7xl font-black transition-colors ${
                        correctAnswer !== null && selectedAnswer !== null
                            ? (selectedAnswer === correctAnswer ? 'text-green-400 drop-shadow-[0_0_25px_rgba(74,222,128,0.5)]' : 'text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.5)]')
                            : isWarning ? 'text-red-500 animate-pulse' : 'text-yellow-400 drop-shadow-[0_0_25px_rgba(234,179,8,0.5)]'
                    }`}>
                        {selectedAnswer !== null
                            ? (correctAnswer !== null
                                ? (selectedAnswer === correctAnswer ? '✓' : '✗')
                                : '⏳')
                            : correctAnswer !== null
                                ? '👁️'
                                : `${timeLeft}s`}
                    </p>
                </div>

                {/* Question card – giống 1v1 */}
                <div className="glass-panel p-12 rounded-[3.5rem] relative shadow-2xl border-t border-white/5">
                    <p className="text-center text-blue-400 font-black text-sm mb-2 uppercase tracking-widest">
                        Câu {gameQuestion?.number}/{gameQuestion?.total}
                    </p>
                    <h2 className="text-3xl font-bold text-center mb-12 leading-relaxed text-white">
                        {gameQuestion?.text}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {gameQuestion?.options.map((option, idx) => {
                            let btnClass = "bg-white/5 border-white/10";
                            
                            // Hiển thị đáp án đúng/sai khi có correctAnswer
                            if (correctAnswer !== null) {
                                if (idx === correctAnswer) {
                                    // Đáp án đúng - màu xanh
                                    btnClass = "bg-green-600/60 border-green-400 shadow-[0_0_30px_green]";
                                } else if (selectedAnswer === idx) {
                                    // Đáp án sai mà người chơi đã chọn - màu đỏ
                                    btnClass = "bg-red-600/60 border-red-400 shadow-[0_0_30px_red]";
                                } else {
                                    btnClass = "bg-white/3 border-white/5";
                                }
                            } else {
                                // Chưa có kết quả
                                if (isEliminated || isSpectator) {
                                    btnClass = "bg-white/3 border-white/5 opacity-50";
                                } else if (selectedAnswer === idx) {
                                    btnClass = "bg-purple-600/60 border-purple-400 shadow-[0_0_30px_purple]";
                                } else {
                                    btnClass = "bg-white/5 border-white/10 hover:bg-white/10";
                                }
                            }
                            
                            return (
                                <button key={idx} onClick={() => handleAnswerClick(idx)}
                                    disabled={selectedAnswer !== null || isEliminated || isSpectator || correctAnswer !== null}
                                    className={`p-7 ${btnClass} border-2 rounded-2xl text-left font-bold text-xl transition-all flex items-center disabled:cursor-not-allowed ${!isEliminated && !isSpectator && correctAnswer === null ? 'active:scale-95' : ''}`}>
                                    <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-4 text-sm font-black text-white">
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span className="text-white">{option}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    /* ============ RESULT ============ */
    if (view === 'result') {
        return (
            <div className="w-full max-w-3xl animate-fadeIn">
                <div className="text-center glass-panel p-12 rounded-[3.5rem] shadow-2xl">
                    <h1 className="text-6xl font-black text-yellow-400 italic mb-8 drop-shadow-2xl">
                        🏆 KẾT QUẢ
                    </h1>

                    {/* Winner podium */}
                    {finalStandings?.[0] && (
                        <div className="mb-8">
                            <p className="text-7xl mb-2 animate-bounce">🥇</p>
                            <p className="text-3xl font-black text-yellow-400">{finalStandings[0].display_name}</p>
                            <p className="text-xl text-slate-400 mt-1">{finalStandings[0].score} điểm</p>
                        </div>
                    )}

                    {/* Full standings */}
                    <div className="space-y-2 mb-8">
                        {finalStandings?.map(p => (
                            <div key={p.username}
                                className={`flex justify-between items-center p-4 rounded-2xl
                                    ${p.username === username
                                        ? 'bg-purple-500/20 border border-purple-500/30'
                                        : 'bg-white/5'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl w-10 text-center">
                                        {p.rank === 1 && '🥇'}
                                        {p.rank === 2 && '🥈'}
                                        {p.rank === 3 && '🥉'}
                                        {p.rank > 3 && (
                                            <span className="text-slate-500 text-lg font-black">{p.rank}</span>
                                        )}
                                    </span>
                                    <span className="font-bold text-white">{p.display_name}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="font-black text-yellow-400">{p.score} đ</span>
                                    <span className="text-xs text-slate-500">{p.eliminated_at || 'Hoàn thành'}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button onClick={() => { setView('menu'); setFinalStandings(null); }}
                        className="bg-white text-black px-16 py-5 rounded-2xl font-black text-xl hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95">
                        VỀ MENU TOURNAMENT
                    </button>
                </div>
            </div>
        );
    }

    return null;
}

export default Tournament;
