require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* =========================
   CONFIG
========================= */
const TIME_LIMIT = 10000; // 10 giây

// Track active users: username -> socket.id
const activeSessions = new Map();

// Hàm để xử lý việc đăng nhập - ngăn đăng nhập trùng
function handleUserLogin(socket, username) {
    // Kiểm tra xem user này đã đăng nhập ở nơi khác chưa
    if (activeSessions.has(username)) {
        const oldSocketId = activeSessions.get(username);
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        
        if (oldSocket && oldSocket.id !== socket.id) {
            console.log(`[Auth] User ${username} đang đăng nhập ở socket mới. Kicking old session ${oldSocketId}`);
            // Thông báo cho client cũ biết họ bị kick
            oldSocket.emit('force_logout', { 
                message: 'Tài khoản của bạn đã đăng nhập ở nơi khác' 
            });
            // Disconnect socket cũ
            oldSocket.disconnect(true);
        }
    }
    
    // Lưu session mới
    activeSessions.set(username, socket.id);
    socket.username = username;
    console.log(`[Auth] User ${username} logged in with socket ${socket.id}`);
}

function getTimeBonus(ms) {
    if (ms <= 3000) return 10;
    if (ms <= 6000) return 5;
    return 0;
}

/* =========================
   DATABASE
========================= */
const sequelize = new Sequelize('knowledge_arena', 'root', '', {
    host: 'localhost',
    dialect: 'mysql',
    port: 3306,
    logging: false
});

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true },
    password: DataTypes.STRING,
    display_name: DataTypes.STRING,
    high_score: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_point: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: false });

const Question = sequelize.define('Question', {
    question_text: DataTypes.TEXT,
    option_a: DataTypes.STRING,
    option_b: DataTypes.STRING,
    option_c: DataTypes.STRING,
    option_d: DataTypes.STRING,
    correct_option: DataTypes.INTEGER,
    category: DataTypes.STRING,
    difficulty: { type: DataTypes.INTEGER, defaultValue: 1 } // 1=dễ, 2=trung bình, 3=khó
}, { timestamps: false });

const Tournament = sequelize.define('Tournament', {
    tournament_code: { type: DataTypes.STRING(6), unique: true },
    tournament_name: DataTypes.STRING(100),
    host_username: DataTypes.STRING(50),
    host_is_player: { type: DataTypes.BOOLEAN, defaultValue: false },
    question_source: DataTypes.ENUM('custom', 'system'),
    category: DataTypes.STRING(50),
    status: { type: DataTypes.ENUM('waiting', 'playing', 'finished'), defaultValue: 'waiting' },
    current_question: { type: DataTypes.INTEGER, defaultValue: 0 },
    winner_username: DataTypes.STRING(50)
}, { timestamps: true, createdAt: 'created_at', updatedAt: false, tableName: 'tournaments', freezeTableName: true });

const TournamentQuestion = sequelize.define('TournamentQuestion', {
    tournament_code: DataTypes.STRING(6),
    question_text: DataTypes.TEXT,
    option_a: DataTypes.STRING,
    option_b: DataTypes.STRING,
    option_c: DataTypes.STRING,
    option_d: DataTypes.STRING,
    correct_option: DataTypes.INTEGER,
    question_order: DataTypes.INTEGER
}, { timestamps: false, tableName: 'tournament_questions' });

const TournamentParticipant = sequelize.define('TournamentParticipant', {
    tournament_code: DataTypes.STRING(6),
    username: DataTypes.STRING(50),
    display_name: DataTypes.STRING(50),
    score: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_time: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_eliminated: { type: DataTypes.BOOLEAN, defaultValue: false },
    eliminated_at: { type: DataTypes.INTEGER, defaultValue: null },
    final_rank: DataTypes.INTEGER
}, { timestamps: true, createdAt: 'joined_at', updatedAt: false, tableName: 'tournament_participants' });

const TournamentAnswer = sequelize.define('TournamentAnswer', {
    tournament_code: DataTypes.STRING(6),
    username: DataTypes.STRING(50),
    question_number: DataTypes.INTEGER,
    answer_index: DataTypes.INTEGER,
    is_correct: DataTypes.BOOLEAN,
    time_taken: DataTypes.INTEGER,
    points_earned: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: true, createdAt: 'answered_at', updatedAt: false, tableName: 'tournament_answers' });

/* =========================
   API
========================= */
app.get('/leaderboard', async (req, res) => {
    const top = await User.findAll({
        order: [['high_score', 'DESC']],
        limit: 10,
        attributes: ['username', 'display_name', 'high_score']
    });
    res.json(top);
});

app.post('/register', async (req, res) => {
    const { username, password, display_name } = req.body;
    const exist = await User.findOne({ where: { username } });
    if (exist) return res.json({ success: false, message: "Username đã tồn tại" });

    const hash = await bcrypt.hash(password, 10);

    await User.create({
        username,
        password: hash,
        display_name: display_name || username
    });

    res.json({ success: true });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.json({ success: false });
    }

    res.json({
        success: true,
        username: user.username,
        display_name: user.display_name,
        total_point: user.total_point
    });
});

app.post('/update-name', async (req, res) => {
    const { username, newDisplayName } = req.body;
    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(404).json({ success: false, message: "Không tìm thấy user" });
        }
        
        await user.update({ display_name: newDisplayName });
        res.json({ success: true, message: "Cập nhật tên thành công" });
    } catch (error) {
        console.error("Lỗi cập nhật tên:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
});

/* =========================
   TOURNAMENT API
========================= */

// Tạo mã phòng 6 ký tự duy nhất
function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Tạo giải đấu
app.post('/tournament/create', async (req, res) => {
    try {
        const { 
            tournament_name, 
            host_username, 
            host_is_player,
            question_source, 
            category,
            custom_questions 
        } = req.body;

        // Validate
        if (!tournament_name || !host_username || !question_source) {
            return res.status(400).json({ 
                success: false, 
                message: "Thiếu thông tin bắt buộc" 
            });
        }

        // Tạo mã phòng duy nhất
        let code;
        let exists = true;
        while (exists) {
            code = generateTournamentCode();
            exists = await Tournament.findOne({ where: { tournament_code: code } });
        }

        // Tạo tournament
        const tournament = await Tournament.create({
            tournament_code: code,
            tournament_name,
            host_username,
            host_is_player: host_is_player || false,
            question_source,
            category: question_source === 'system' ? category : null
        });

        // Nếu custom questions, lưu vào DB
        if (question_source === 'custom' && custom_questions?.length > 0) {
            const questionsData = custom_questions.map((q, idx) => ({
                tournament_code: code,
                question_text: q.question_text,
                option_a: q.option_a,
                option_b: q.option_b,
                option_c: q.option_c,
                option_d: q.option_d,
                correct_option: q.correct_option,
                question_order: idx + 1
            }));
            await TournamentQuestion.bulkCreate(questionsData);
        }

        res.json({ 
            success: true, 
            tournament_code: code
        });
    } catch (error) {
        console.error("Lỗi tạo tournament:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
});

// Lấy 10 câu ngẫu nhiên từ một chủ đề
app.post('/tournament/random-questions', async (req, res) => {
    try {
        const { category } = req.body;

        if (!category) {
            return res.status(400).json({ 
                success: false, 
                message: "Thiếu thông tin chủ đề" 
            });
        }

        // Lấy câu hỏi random từ mỗi độ khó: 3 dễ, 4 trung bình, 3 khó
        const easyQs = await Question.findAll({
            where: { category, difficulty: 1 },
            order: sequelize.random(),
            limit: 3
        });
        
        const mediumQs = await Question.findAll({
            where: { category, difficulty: 2 },
            order: sequelize.random(),
            limit: 4
        });
        
        const hardQs = await Question.findAll({
            where: { category, difficulty: 3 },
            order: sequelize.random(),
            limit: 3
        });

        // Kết hợp và trộn lại
        const allQs = [...easyQs, ...mediumQs, ...hardQs];
        const questions = allQs.sort(() => Math.random() - 0.5).map(q => ({
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: q.correct_option
        }));

        res.json({ 
            success: true, 
            questions
        });
    } catch (error) {
        console.error("Lỗi lấy câu hỏi ngẫu nhiên:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
});

// Lấy thông tin tournament
app.get('/tournament/:code', async (req, res) => {
    try {
        const tournament = await Tournament.findOne({ 
            where: { tournament_code: req.params.code } 
        });
        
        if (!tournament) {
            return res.status(404).json({ success: false, message: "Không tìm thấy giải đấu" });
        }

        const participants = await TournamentParticipant.findAll({
            where: { tournament_code: tournament.tournament_code }
        });

        res.json({ 
            success: true, 
            tournament: tournament.toJSON(),
            participants: participants.map(p => p.toJSON())
        });
    } catch (error) {
        console.error("Lỗi lấy tournament:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
});

// Lấy danh sách tournament của user
app.get('/tournament/user/:username', async (req, res) => {
    try {
        const tournaments = await Tournament.findAll({
            where: { 
                host_username: req.params.username,
                status: ['waiting', 'playing']
            },
            order: [['created_at', 'DESC']],
            limit: 20
        });

        res.json({ success: true, tournaments });
    } catch (error) {
        console.error("Lỗi lấy tournaments:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
});

/* =========================
   GAME LOGIC
========================= */
let queues = {};
let rooms = {};
let tournaments = {}; // Tournament rooms in memory

function nextStep(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.currentQIndex++;

    if (room.currentQIndex >= room.questions.length) {
        // END GAME
        const updates = Object.keys(room.scores).map(async sid => {
            const socket = io.sockets.sockets.get(sid);
            if (!socket?.username) return;

            const user = await User.findOne({ where: { username: socket.username } });
            if (!user) return;

            const score = room.scores[sid];
            await user.update({
                high_score: Math.max(user.high_score, score),
                total_point: user.total_point + score
            });
        });

        const finalResults = {};
        Promise.all(updates).then(async () => {
            for (const sid of Object.keys(room.scores)) {
                const socketObj = io.sockets.sockets.get(sid);
                if (socketObj?.username) {
                    const user = await User.findOne({ where: { username: socketObj.username } });
                    if (user) {
                        finalResults[sid] = { newTotalPoint: user.total_point };
                    }
                }
            }
            io.to(roomId).emit("game_over", { scores: room.scores, details: finalResults });
            delete rooms[roomId];
        });
        return;
    }

    room.questionStartAt = Date.now();
    room.currentAnswers = {}; // Reset câu trả lời cho câu hỏi mới

    const q = room.questions[room.currentQIndex];
    io.to(roomId).emit("next_question", {
        question: {
            text: q.question_text,
            options: [q.option_a, q.option_b, q.option_c, q.option_d]
        },
        scores: room.scores
    });
}

io.on("connection", socket => {

    // Authenticate user ngay khi connect
    socket.on("authenticate", ({ username }) => {
        if (username) {
            handleUserLogin(socket, username);
        }
    });

    // Cleanup khi disconnect
    socket.on("disconnect", () => {
        if (socket.username) {
            // Chỉ xóa nếu socket disconnect là socket hiện tại của user đó
            if (activeSessions.get(socket.username) === socket.id) {
                activeSessions.delete(socket.username);
                console.log(`[Auth] User ${socket.username} logged out (socket ${socket.id})`);
            }
        }
    });

    socket.on("find_match", async ({ category, username }) => {
        handleUserLogin(socket, username);

        if (!queues[category]) queues[category] = [];
        queues[category].push(socket);

        if (queues[category].length >= 2) {
            const p1 = queues[category].shift();
            const p2 = queues[category].shift();

            const roomId = "room_" + Date.now();
            
            // Lấy câu hỏi random từ mỗi độ khó: 3 dễ, 4 trung bình, 3 khó
            const easyQuestions = await Question.findAll({
                where: { category, difficulty: 1 },
                order: sequelize.random(),
                limit: 3
            });
            
            const mediumQuestions = await Question.findAll({
                where: { category, difficulty: 2 },
                order: sequelize.random(),
                limit: 4
            });
            
            const hardQuestions = await Question.findAll({
                where: { category, difficulty: 3 },
                order: sequelize.random(),
                limit: 3
            });
            
            // Trộn lẫn thứ tự để tạo độ khó không đoán trước được
            const allQuestions = [...easyQuestions, ...mediumQuestions, ...hardQuestions];
            const questions = allQuestions.sort(() => Math.random() - 0.5);
            
            if (questions.length === 0) {
                console.error(`❌ Không có câu hỏi cho category "${category}"`);
                p1.emit("match_error", { message: "Không có câu hỏi cho category này" });
                p2.emit("match_error", { message: "Không có câu hỏi cho category này" });
                return;
            }

            const u1 = await User.findOne({ where: { username: p1.username } });
            const u2 = await User.findOne({ where: { username: p2.username } });

            rooms[roomId] = {
                players: [p1.id, p2.id],
                scores: { [p1.id]: 0, [p2.id]: 0 },
                streaks: { [p1.id]: 0, [p2.id]: 0 },
                questions,
                currentQIndex: 0,
                questionStartAt: Date.now(),
                currentAnswers: {} // Lưu câu trả lời của từng người cho câu hiện tại
            };

            p1.join(roomId);
            p2.join(roomId);

            const q = questions[0];
            io.to(roomId).emit("match_found", {
                roomId,
                category,
                question: {
                    text: q.question_text,
                    options: [q.option_a, q.option_b, q.option_c, q.option_d]
                },
                names: {
                    [p1.id]: u1?.display_name || u1?.username || p1.username,
                    [p2.id]: u2?.display_name || u2?.username || p2.username
                }
            });
        }
    });

    socket.on("submit_answer", ({ roomId, answerIndex, isStar }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Nếu người này đã trả lời rồi thì bỏ qua
        if (room.currentAnswers[socket.id]) return;

        const q = room.questions[room.currentQIndex];
        const elapsed = Date.now() - room.questionStartAt;

        let bonus = getTimeBonus(elapsed);
        let correct = answerIndex === q.correct_option;

        if (elapsed > TIME_LIMIT) correct = false;

        // Lưu câu trả lời
        room.currentAnswers[socket.id] = {
            answerIndex,
            elapsed,
            bonus,
            correct,
            isStar
        };

        // Thông báo cho đối thủ biết người này đã trả lời (không tiết lộ đúng/sai)
        const opponentId = room.players.find(pid => pid !== socket.id);
        if (opponentId) {
            io.to(opponentId).emit("opponent_answered", { playerId: socket.id });
        }

        console.log(`[1v1] Player ${socket.id} answered. Total answered: ${Object.keys(room.currentAnswers).length}/2`);

        // Kiểm tra xem cả 2 đã trả lời chưa
        const bothAnswered = room.players.every(pid => room.currentAnswers[pid]);

        if (bothAnswered) {
            console.log(`[1v1] Both players answered. Showing results.`);
            // Cả 2 đã trả lời, tính điểm và emit kết quả
            room.players.forEach(playerId => {
                const answer = room.currentAnswers[playerId];
                if (answer.correct) {
                    room.streaks[playerId]++;
                    let pts = 10 + answer.bonus;

                    if (room.streaks[playerId] >= 3) pts += 5;
                    if (answer.isStar) pts *= 2;

                    room.scores[playerId] += pts;
                } else {
                    room.streaks[playerId] = 0;
                    if (answer.isStar) room.scores[playerId] -= 20;
                }
            });

            // Emit kết quả cho cả 2 người
            io.to(roomId).emit("both_answered", {
                correctIndex: q.correct_option,
                answers: room.currentAnswers,
                scores: room.scores,
                streaks: room.streaks
            });

            // Reset currentAnswers cho câu tiếp theo
            room.currentAnswers = {};

            setTimeout(() => nextStep(roomId), 3000);
        }
    });

    socket.on("timeout_answer", ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Nếu người này đã trả lời rồi thì bỏ qua
        if (room.currentAnswers[socket.id]) return;

        console.log(`[1v1] Player ${socket.id} timed out`);

        // Lưu câu trả lời timeout (sai)
        room.currentAnswers[socket.id] = {
            answerIndex: -1,
            elapsed: TIME_LIMIT,
            bonus: 0,
            correct: false,
            isStar: false
        };

        room.streaks[socket.id] = 0;

        // Kiểm tra xem cả 2 đã trả lời chưa
        const bothAnswered = room.players.every(pid => room.currentAnswers[pid]);

        if (bothAnswered) {
            console.log(`[1v1] Both answered (with timeout). Showing results.`);
            const q = room.questions[room.currentQIndex];

            // Tính điểm cho cả 2
            room.players.forEach(playerId => {
                const answer = room.currentAnswers[playerId];
                if (answer.correct) {
                    room.streaks[playerId]++;
                    let pts = 10 + answer.bonus;
                    if (room.streaks[playerId] >= 3) pts += 5;
                    if (answer.isStar) pts *= 2;
                    room.scores[playerId] += pts;
                } else {
                    room.streaks[playerId] = 0;
                    if (answer.isStar) room.scores[playerId] -= 20;
                }
            });

            // Emit kết quả
            io.to(roomId).emit("both_answered", {
                correctIndex: q.correct_option,
                answers: room.currentAnswers,
                scores: room.scores,
                streaks: room.streaks
            });

            // Reset
            room.currentAnswers = {};

            setTimeout(() => nextStep(roomId), 3000);
        } else {
            // Thông báo cho đối thủ biết người này đã timeout (chưa hiện kết quả)
            const opponentId = room.players.find(pid => pid !== socket.id);
            if (opponentId) {
                io.to(opponentId).emit("opponent_answered", { playerId: socket.id });
            }
        }
    });

    /* =========================
       TOURNAMENT SOCKET EVENTS
    ========================= */

    // Spectate tournament (Host không tham gia thi đấu)
    socket.on("spectate_tournament", async ({ tournament_code, username }) => {
        try {
            const tournament = await Tournament.findOne({ 
                where: { tournament_code } 
            });

            if (!tournament) {
                return socket.emit("tournament_error", { message: "Không tìm thấy giải đấu" });
            }

            // Host join room để nhận update nhưng không join như participant
            socket.join(tournament_code);
            socket.tournamentCode = tournament_code;
            handleUserLogin(socket, username);
            socket.isSpectator = true;

            const participants = await TournamentParticipant.findAll({
                where: { tournament_code: tournament.tournament_code, is_eliminated: false }
            });

            socket.emit("tournament_joined", { 
                success: true,
                tournament: tournament.toJSON(),
                is_spectator: true
            });

            // Notify về số người chơi hiện tại
            io.to(tournament_code).emit("tournament_updated", {
                participants: participants.map(p => ({
                    username: p.username,
                    display_name: p.display_name,
                    score: p.score
                })),
                player_count: participants.length
            });
        } catch (error) {
            console.error("Lỗi spectate tournament:", error);
            socket.emit("tournament_error", { message: "Lỗi máy chủ" });
        }
    });

    // Join tournament
    socket.on("join_tournament", async ({ tournament_code, username }) => {
        try {
            const tournament = await Tournament.findOne({ 
                where: { tournament_code } 
            });

            if (!tournament) {
                return socket.emit("tournament_error", { message: "Không tìm thấy giải đấu" });
            }

            if (tournament.status !== 'waiting') {
                return socket.emit("tournament_error", { message: "Giải đấu đã bắt đầu hoặc kết thúc" });
            }

            // Kiểm tra số lượng người chơi
            const participantCount = await TournamentParticipant.count({
                where: { tournament_code: tournament.tournament_code }
            });

            if (participantCount >= 10) {
                return socket.emit("tournament_error", { message: "Giải đấu đã đủ người" });
            }

            // Kiểm tra đã join chưa
            const existing = await TournamentParticipant.findOne({
                where: { tournament_code: tournament.tournament_code, username }
            });

            if (existing) {
                socket.join(tournament_code);
                socket.tournamentCode = tournament_code;
                handleUserLogin(socket, username);
            } else {
                const user = await User.findOne({ where: { username } });
                await TournamentParticipant.create({
                    tournament_code: tournament.tournament_code,
                    username,
                    display_name: user?.display_name || username
                });

                socket.join(tournament_code);
                socket.tournamentCode = tournament_code;
                handleUserLogin(socket, username);
            }

            const participants = await TournamentParticipant.findAll({
                where: { tournament_code: tournament.tournament_code, is_eliminated: false }
            });

            io.to(tournament_code).emit("tournament_updated", {
                participants: participants.map(p => ({
                    username: p.username,
                    display_name: p.display_name,
                    score: p.score
                })),
                player_count: participants.length
            });

            socket.emit("tournament_joined", { 
                success: true,
                tournament: tournament.toJSON()
            });
        } catch (error) {
            console.error("Lỗi join tournament:", error);
            socket.emit("tournament_error", { message: "Lỗi máy chủ" });
        }
    });

    // Start tournament
    socket.on("start_tournament", async ({ tournament_code }) => {
        try {
            const tournament = await Tournament.findOne({ 
                where: { tournament_code } 
            });

            if (!tournament) {
                return socket.emit("tournament_error", { message: "Không tìm thấy giải đấu" });
            }

            if (tournament.host_username !== socket.username) {
                return socket.emit("tournament_error", { message: "Chỉ host mới có thể bắt đầu" });
            }

            const participants = await TournamentParticipant.findAll({
                where: { tournament_code: tournament.tournament_code }
            });

            if (participants.length < 2) {
                return socket.emit("tournament_error", { message: "Cần ít nhất 2 người chơi" });
            }

            let questions;
            if (tournament.question_source === 'custom') {
                const customQs = await TournamentQuestion.findAll({
                    where: { tournament_code: tournament.tournament_code },
                    order: [['question_order', 'ASC']]
                });
                questions = customQs.map(q => q.toJSON());
            } else {
                const easyQs = await Question.findAll({
                    where: { category: tournament.category, difficulty: 1 },
                    order: sequelize.random(),
                    limit: 9
                });
                const mediumQs = await Question.findAll({
                    where: { category: tournament.category, difficulty: 2 },
                    order: sequelize.random(),
                    limit: 12
                });
                const hardQs = await Question.findAll({
                    where: { category: tournament.category, difficulty: 3 },
                    order: sequelize.random(),
                    limit: 9
                });
                const allQs = [...easyQs, ...mediumQs, ...hardQs];
                questions = allQs.sort(() => Math.random() - 0.5).map(q => q.toJSON());
            }

            if (questions.length < 10) {
                return socket.emit("tournament_error", { message: "Không đủ câu hỏi" });
            }

            await tournament.update({
                status: 'playing',
                current_question: 1
            });

            tournaments[tournament_code] = {
                tournamentCode: tournament.tournament_code,
                questions,
                currentQuestion: 1,
                participants: participants.map(p => ({
                    username: p.username,
                    display_name: p.display_name,
                    score: 0,
                    totalTime: 0,
                    eliminated: false,
                    answers: {}
                })),
                questionStartTime: Date.now(),
                questionTimer: null
            };

            // Auto-timeout sau 10 giây
            tournaments[tournament_code].questionTimer = setTimeout(() => {
                forceEndQuestion(tournament_code);
            }, TIME_LIMIT);

            const firstQ = questions[0];
            io.to(tournament_code).emit("tournament_started", {
                question: {
                    number: 1,
                    total: questions.length,
                    text: firstQ.question_text,
                    options: [firstQ.option_a, firstQ.option_b, firstQ.option_c, firstQ.option_d]
                },
                is_warmup: true,
                time_limit: TIME_LIMIT / 1000
            });
        } catch (error) {
            console.error("Lỗi start tournament:", error);
            socket.emit("tournament_error", { message: "Lỗi máy chủ" });
        }
    });

    // Submit tournament answer
    socket.on("submit_tournament_answer", async ({ tournament_code, answer_index, time_taken }) => {
        try {
            const tournamentRoom = tournaments[tournament_code];
            if (!tournamentRoom) return;

            const participant = tournamentRoom.participants.find(p => p.username === socket.username);
            if (!participant || participant.eliminated) return;

            if (participant.answers[tournamentRoom.currentQuestion]) return;

            const currentQ = tournamentRoom.questions[tournamentRoom.currentQuestion - 1];
            const isCorrect = answer_index === currentQ.correct_option;
            
            let points = 0;
            if (isCorrect) {
                points = 10;
                if (time_taken <= 3000) points += 10;
                else if (time_taken <= 6000) points += 5;
            }

            participant.score += points;
            participant.totalTime += time_taken;
            participant.answers[tournamentRoom.currentQuestion] = {
                answer_index,
                is_correct: isCorrect,
                points
            };

            await TournamentAnswer.create({
                tournament_code: tournamentRoom.tournamentCode,
                username: socket.username,
                question_number: tournamentRoom.currentQuestion,
                answer_index,
                is_correct: isCorrect,
                time_taken,
                points_earned: points
            });

            const activePlayers = tournamentRoom.participants.filter(p => !p.eliminated);
            const allAnswered = activePlayers.every(p => p.answers[tournamentRoom.currentQuestion]);
            
            console.log(`[Tournament] Player ${socket.username} answered question ${tournamentRoom.currentQuestion}. Active players: ${activePlayers.length}, Answered: ${activePlayers.filter(p => p.answers[tournamentRoom.currentQuestion]).length}/${activePlayers.length}`);

            // Luôn đợi tất cả người chơi trả lời rồi mới hiện kết quả
            if (allAnswered) {
                console.log(`[Tournament] All players answered. Showing results.`);
                
                // Hủy timer vì tất cả đã trả lời
                if (tournamentRoom.questionTimer) {
                    clearTimeout(tournamentRoom.questionTimer);
                    tournamentRoom.questionTimer = null;
                }
                io.to(tournament_code).emit("question_results", {
                    correct_answer: currentQ.correct_option,
                    leaderboard: activePlayers
                        .sort((a, b) => {
                            if (b.score !== a.score) return b.score - a.score;
                            return a.totalTime - b.totalTime;
                        })
                        .map((p, idx) => ({
                            rank: idx + 1,
                            username: p.username,
                            display_name: p.display_name,
                            score: p.score,
                            last_answer: p.answers[tournamentRoom.currentQuestion]?.is_correct
                        }))
                });

                setTimeout(async () => {
                    const currentQNum = tournamentRoom.currentQuestion;
                    const activeCount = activePlayers.length;
                    let hasElimination = false;

                    if (currentQNum >= 3 && activeCount > 2) {
                        const sorted = activePlayers.sort((a, b) => {
                            if (a.score !== b.score) return a.score - b.score;
                            return b.totalTime - a.totalTime;
                        });

                        const eliminated = sorted[0];
                        eliminated.eliminated = true;
                        hasElimination = true;

                        await TournamentParticipant.update(
                            { is_eliminated: true, eliminated_at: currentQNum },
                            { where: { 
                                tournament_code: tournamentRoom.tournamentCode, 
                                username: eliminated.username 
                            }}
                        );

                        io.to(tournament_code).emit("player_eliminated", {
                            username: eliminated.username,
                            display_name: eliminated.display_name,
                            final_score: eliminated.score,
                            remaining_players: activeCount - 1
                        });
                    }

                    // Nếu có loại: đợi 2s để hiện overlay, không loại: chuyển luôn
                    setTimeout(() => {
                        tournamentRoom.currentQuestion++;

                        if (tournamentRoom.currentQuestion > tournamentRoom.questions.length) {
                            finishTournament(tournament_code);
                        } else {
                            const activeNow = tournamentRoom.participants.filter(p => !p.eliminated);
                            const nextQ = tournamentRoom.questions[tournamentRoom.currentQuestion - 1];
                            const willEliminate = tournamentRoom.currentQuestion >= 3 && activeNow.length > 2;
                            const isFinal = activeNow.length === 2;

                            tournamentRoom.questionStartTime = Date.now();

                            // Set timer cho câu tiếp
                            tournamentRoom.questionTimer = setTimeout(() => {
                                forceEndQuestion(tournament_code);
                            }, TIME_LIMIT);

                            io.to(tournament_code).emit("next_tournament_question", {
                                question: {
                                    number: tournamentRoom.currentQuestion,
                                    total: tournamentRoom.questions.length,
                                    text: nextQ.question_text,
                                    options: [nextQ.option_a, nextQ.option_b, nextQ.option_c, nextQ.option_d]
                                },
                                is_warmup: tournamentRoom.currentQuestion <= 2,
                                will_eliminate: willEliminate,
                                is_final_phase: isFinal,
                                remaining_players: activeNow.length,
                                time_limit: TIME_LIMIT / 1000
                            });
                        }
                    }, hasElimination ? 5000 : 500);
                }, 3500);
            }
        } catch (error) {
            console.error("Lỗi submit tournament answer:", error);
        }
    });

    // Force end question khi hết giờ
    async function forceEndQuestion(tournament_code) {
        const tournamentRoom = tournaments[tournament_code];
        if (!tournamentRoom) return;

        tournamentRoom.questionTimer = null;
        const activePlayers = tournamentRoom.participants.filter(p => !p.eliminated);

        // Ai chưa trả lời thì ghi 0 điểm
        for (const p of activePlayers) {
            if (!p.answers[tournamentRoom.currentQuestion]) {
                p.answers[tournamentRoom.currentQuestion] = {
                    answer_index: -1,
                    is_correct: false,
                    points: 0
                };
                p.totalTime += TIME_LIMIT;

                await TournamentAnswer.create({
                    tournament_code: tournamentRoom.tournamentCode,
                    username: p.username,
                    question_number: tournamentRoom.currentQuestion,
                    answer_index: -1,
                    is_correct: false,
                    time_taken: TIME_LIMIT,
                    points_earned: 0
                });
            }
        }

        const currentQ = tournamentRoom.questions[tournamentRoom.currentQuestion - 1];

        console.log(`[Tournament] Force end question ${tournamentRoom.currentQuestion}. Emitting results to all players in room ${tournament_code}`);

        // Emit kết quả cho TẤT CẢ người trong room (kể cả người bị loại)
        io.to(tournament_code).emit("question_results", {
            correct_answer: currentQ.correct_option,
            leaderboard: activePlayers
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.totalTime - b.totalTime;
                })
                .map((p, idx) => ({
                    rank: idx + 1,
                    username: p.username,
                    display_name: p.display_name,
                    score: p.score,
                    last_answer: p.answers[tournamentRoom.currentQuestion]?.is_correct
                }))
        });

        // Loại + câu tiếp (giống logic allAnswered)
        setTimeout(async () => {
            const currentQNum = tournamentRoom.currentQuestion;
            const activeCount = activePlayers.length;
            let hasElimination = false;

            if (currentQNum >= 3 && activeCount > 2) {
                const sorted = [...activePlayers].sort((a, b) => {
                    if (a.score !== b.score) return a.score - b.score;
                    return b.totalTime - a.totalTime;
                });

                const eliminated = sorted[0];
                eliminated.eliminated = true;
                hasElimination = true;

                await TournamentParticipant.update(
                    { is_eliminated: true, eliminated_at: currentQNum },
                    { where: { tournament_code: tournamentRoom.tournamentCode, username: eliminated.username }}
                );

                io.to(tournament_code).emit("player_eliminated", {
                    username: eliminated.username,
                    display_name: eliminated.display_name,
                    final_score: eliminated.score,
                    remaining_players: activeCount - 1
                });
            }

            // Nếu có loại: đợi 2s, không loại: chuyển luôn
            setTimeout(() => {
                tournamentRoom.currentQuestion++;

                if (tournamentRoom.currentQuestion > tournamentRoom.questions.length) {
                    finishTournament(tournament_code);
                } else {
                    const activeNow = tournamentRoom.participants.filter(p => !p.eliminated);
                    const nextQ = tournamentRoom.questions[tournamentRoom.currentQuestion - 1];
                    const willEliminate = tournamentRoom.currentQuestion >= 3 && activeNow.length > 2;
                    const isFinal = activeNow.length === 2;

                    tournamentRoom.questionStartTime = Date.now();

                    tournamentRoom.questionTimer = setTimeout(() => {
                        forceEndQuestion(tournament_code);
                    }, TIME_LIMIT);

                    io.to(tournament_code).emit("next_tournament_question", {
                        question: {
                            number: tournamentRoom.currentQuestion,
                            total: tournamentRoom.questions.length,
                            text: nextQ.question_text,
                            options: [nextQ.option_a, nextQ.option_b, nextQ.option_c, nextQ.option_d]
                        },
                        is_warmup: tournamentRoom.currentQuestion <= 2,
                        will_eliminate: willEliminate,
                        is_final_phase: isFinal,
                        remaining_players: activeNow.length,
                        time_limit: TIME_LIMIT / 1000
                    });
                }
            }, hasElimination ? 5000 : 500);
        }, 3500);
    }

    // Finish tournament
    async function finishTournament(tournament_code) {
        const tournamentRoom = tournaments[tournament_code];
        if (!tournamentRoom) return;

        const finalStandings = tournamentRoom.participants
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.totalTime - b.totalTime;
            })
            .map((p, idx) => ({
                rank: idx + 1,
                username: p.username,
                display_name: p.display_name,
                score: p.score,
                eliminated_at: p.eliminated ? "Loại" : "Chung kết"
            }));

        const tournament = await Tournament.findOne({
            where: { tournament_code }
        });

        await tournament.update({
            status: 'finished',
            winner_username: finalStandings[0].username
        });

        for (let i = 0; i < finalStandings.length; i++) {
            await TournamentParticipant.update(
                { 
                    score: finalStandings[i].score,
                    final_rank: finalStandings[i].rank 
                },
                { where: { 
                    tournament_code: tournamentRoom.tournamentCode,
                    username: finalStandings[i].username
                }}
            );
        }

        io.to(tournament_code).emit("tournament_finished", {
            standings: finalStandings,
            winner: finalStandings[0]
        });

        delete tournaments[tournament_code];
    }

    // Leave tournament
    socket.on("leave_tournament", () => {
        if (socket.tournamentCode) {
            socket.leave(socket.tournamentCode);
        }
    });

    // Disconnect - cleanup tournament
    const originalDisconnect = socket.disconnect;
    socket.on("disconnect", () => {
        if (socket.tournamentCode) {
            socket.leave(socket.tournamentCode);
        }
    });

});

/* =========================
   START SERVER
========================= */
sequelize.sync().then(() => {
    server.listen(4000, () => {
        console.log("🚀 Arena Quiz Server running ");
    });
});
