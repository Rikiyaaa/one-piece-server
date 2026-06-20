import "dotenv/config";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { monitor } from "@colyseus/monitor";
import { GameState, CardOnField, PlayerState } from "shared";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./models/User";
import { UserDeck } from "./models/UserDeck";

const port = Number(process.env.PORT || 2567);
const app = express();
// CORS: ถ้าตั้ง FRONTEND_URL ไว้ (ตอน deploy จริง) จะอนุญาตเฉพาะ origin นั้น
// ถ้าไม่ตั้ง (dev local) จะอนุญาตทุก origin เพื่อความสะดวก
const FRONTEND_URL = process.env.FRONTEND_URL;
app.use(cors({
  origin: FRONTEND_URL ? FRONTEND_URL.split(',').map(s => s.trim()) : true,
  credentials: true,
}));
app.use(express.json());

// ────────────────────────────────────────────────
//  Deck Routes (Middleware for Auth)
// ────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn("⚠️  ไม่พบ JWT_SECRET ใน .env — ใช้ค่า fallback สำหรับ dev เท่านั้น ห้ามใช้ค่านี้ตอน deploy จริง!");
  return "dev-only-insecure-secret";
})();

const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).send({ message: 'Unauthorized' });
    }
};

const MAX_DECKS = 5;


// GET all decks
app.get('/api/decks', authenticate, async (req: any, res: any) => {
    try {
        const decks = await UserDeck.find({ userId: req.userId }).sort({ updatedAt: -1 });
        res.send(decks);
    } catch (err) {
        res.status(400).send({ message: 'Error fetching decks' });
    }
});

// POST create deck (max 5)
app.post('/api/decks', authenticate, async (req: any, res: any) => {
    const { name, cards, leader, donCount } = req.body;
    try {
        const count = await UserDeck.countDocuments({ userId: req.userId });
        if (count >= MAX_DECKS) {
            return res.status(400).send({ message: `บันทึกได้สูงสุด ${MAX_DECKS} เด็คต่อผู้เล่น` });
        }
        const deck = await UserDeck.create({ userId: req.userId, name, cards, leader, donCount });
        res.status(201).send(deck);
    } catch (err) {
        res.status(400).send({ message: 'Error saving deck' });
    }
});

// PUT update deck
app.put('/api/decks/:id', authenticate, async (req: any, res: any) => {
    const { name, cards, leader, donCount } = req.body;
    try {
        const deck = await UserDeck.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { name, cards, leader, donCount, updatedAt: new Date() },
            { new: true }
        );
        if (!deck) return res.status(404).send({ message: 'Deck not found' });
        res.send(deck);
    } catch (err) {
        res.status(400).send({ message: 'Error updating deck' });
    }
});

// DELETE deck
app.delete('/api/decks/:id', authenticate, async (req: any, res: any) => {
    try {
        const deck = await UserDeck.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!deck) return res.status(404).send({ message: 'Deck not found' });
        res.send({ message: 'Deck deleted' });
    } catch (err) {
        res.status(400).send({ message: 'Error deleting deck' });
    }
});

// ────────────────────────────────────────────────
//  MongoDB Connection
// ────────────────────────────────────────────────
// หมายเหตุ: Mongo ใช้สำหรับ login/สมัครสมาชิก/บันทึกเด็คเท่านั้น
// ไม่ใช่ตัวที่ทำให้ multiplayer (WebSocket) เชื่อมต่อกันไม่ได้ — ถ้า "ต่อห้องเล่นกันได้" แต่
// "ล็อกอิน/บันทึกเด็คไม่ได้" ปัญหาน่าจะอยู่ที่ตรงนี้ (เน็ตเข้า MongoDB Atlas ไม่ได้/credential ผิด)
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error(
    "❌ ไม่พบ MONGO_URI ใน .env — ระบบ login/สมัครสมาชิก/บันทึกเด็คจะใช้งานไม่ได้\n" +
    "   สร้างไฟล์ server/.env แล้วเพิ่ม: MONGO_URI=mongodb+srv://...\n" +
    "   (เกมส่วน multiplayer/วางการ์ดบนบอร์ดยังเล่นได้ตามปกติ เพราะไม่ได้พึ่ง MongoDB)"
  );
} else {
  mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
  }).catch(err => {
    console.error('❌ Could not connect to MongoDB Atlas:', err.message);
    console.error('   ตรวจสอบ: 1) MONGO_URI ใน .env ถูกต้องไหม 2) IP ของเครื่องนี้ถูก allowlist ใน Atlas Network Access ไหม 3) เน็ตเข้าถึง Atlas ได้ไหม');
  });
}

// ────────────────────────────────────────────────
//  Auth Routes
// ────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await User.create({ username, password: hashedPassword });
        res.status(201).send({ message: 'User created' });
    } catch (err) {
        res.status(400).send({ message: 'Error creating user' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).send({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.send({ token, username: user.username });
});

// ────────────────────────────────────────────────
//  CardGameRoom — ส่ง message ต่อๆ ไปอีกฝั่ง
//  (relay-style: server ไม่ validate logic เกม)
// ────────────────────────────────────────────────
class CardGameRoom extends Room<GameState> {
  maxClients = 2;

  onCreate(options: any) {
    this.setState(new GameState());

    // ──── relay helpers ────
    const relay = (sender: Client, type: string, data: any) => {
      this.clients.forEach((c) => {
        if (c.sessionId !== sender.sessionId) c.send(type, data);
      });
    };

    const broadcast = (type: string, data: any) => {
      this.broadcast(type, data);
    };

    // ──── Server-side safety valve สำหรับ high-frequency messages ────
    // Client throttle ดีอยู่แล้ว (cursor=50ms, drag=33ms) แต่ป้องกันไว้อีกชั้น
    // กรณีที่ client มี bug หรือส่งมาถี่กว่าที่ตั้งใจ → ไม่ให้ท่วม send buffer
    const CURSOR_MIN_MS = 33;   // ≤30fps
    const DRAG_MIN_MS   = 20;   // ≤50fps
    const lastCursorTs  = new Map<string, number>();
    const lastDragTs    = new Map<string, number>();

    // ──── Card actions ────
    this.onMessage("card_spawn", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) {
        const card = new CardOnField();
        card.id = data.cid;
        card.cardId = data.cardId;
        card.x = data.x;
        card.y = data.y;
        card.faceDown = data.faceDown;
        card.owner = client.sessionId;
        ps.field.set(data.cid, card);
      }
      relay(client, "card_spawn", data);
    });
    this.onMessage("card_move", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) {
        card.x = data.x;
        card.y = data.y;
      }
      relay(client, "card_move", data);
    });
    this.onMessage("card_remove", (client, data) => {
      const ps = this.getPlayerState(client);
      ps?.field.delete(data.cid);
      relay(client, "card_remove", data);
    });
    this.onMessage("card_tap", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) card.isTapped = data.tapped;
      relay(client, "card_tap", data);
    });
    this.onMessage("card_flip", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) card.faceDown = data.faceDown;
      relay(client, "card_flip", data);
    });
    this.onMessage("card_rotate", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) card.rotation = data.rotation;
      relay(client, "card_rotate", data);
    });
    this.onMessage("card_counter", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) card.counter = data.val;
      relay(client, "card_counter", data);
    });

    // ──── DON!! ────
    this.onMessage("don_card_spawn", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) {
        const card = new CardOnField();
        card.id = data.cid;
        card.x = data.x;
        card.y = data.y;
        card.isDon = true;
        card.owner = client.sessionId;
        ps.field.set(data.cid, card);
      }
      relay(client, "don_card_spawn", data);
    });
    this.onMessage("don_card_move", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) {
        card.x = data.x;
        card.y = data.y;
      }
      relay(client, "don_card_move", data);
    });
    this.onMessage("don_card_tap", (client, data) => {
      const ps = this.getPlayerState(client);
      const card = ps?.field.get(data.cid);
      if (card) card.isTapped = data.tapped;
      relay(client, "don_card_tap", data);
    });
    this.onMessage("don_card_remove", (client, data) => {
      const ps = this.getPlayerState(client);
      ps?.field.delete(data.cid);
      relay(client, "don_card_remove", data);
    });
    this.onMessage("don_change", (client, data) => {
      // อัพเดท state + relay
      const ps = this.getPlayerState(client);
      if (ps) { ps.donTotal = data.total; ps.donSpent = data.spent; }
      relay(client, "don_change", data);
    });

    // ──── Life ────
    this.onMessage("life_change", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) ps.life = data.val;
      relay(client, "life_change", data);
    });

    // ──── Phase / Turn ────
    this.onMessage("phase", (client, data) => {
      this.state.phase = data.phase;
      this.state.turn = data.turn;
      relay(client, "phase", data);
    });

    // ──── Hand / Deck count ────
    this.onMessage("hand_count", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) ps.handCount = data.count;
      relay(client, "hand_count", data);
    });
    this.onMessage("draw", (client, data) => {
      relay(client, "draw", data);
    });
    this.onMessage("deck_count", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) ps.deckCount = data.count;
      relay(client, "deck_count", data);
    });

    // ──── Full state sync (เพื่อ reconnect recovery) ────
    // client ส่งมาทุกครั้งที่ hand/deck/life เปลี่ยน เพื่อให้ server เก็บ snapshot ล่าสุดไว้
    this.onMessage("sync_hand", (client, data: { hand: string[] }) => {
      const ps = this.getPlayerState(client);
      if (!ps) return;
      ps.hand.splice(0, ps.hand.length, ...data.hand);
    });
    this.onMessage("sync_deck", (client, data: { deck: string[] }) => {
      const ps = this.getPlayerState(client);
      if (!ps) return;
      ps.deck.splice(0, ps.deck.length, ...data.deck);
    });
    this.onMessage("sync_life_cards", (client, data: { lifeCards: string[] }) => {
      const ps = this.getPlayerState(client);
      if (!ps) return;
      ps.lifeCards.splice(0, ps.lifeCards.length, ...data.lifeCards);
    });
    this.onMessage("sync_trash", (client, data: { trashCards: string[] }) => {
      const ps = this.getPlayerState(client);
      if (!ps) return;
      ps.trashCards.splice(0, ps.trashCards.length, ...data.trashCards);
    });

    // ──── Cursor ────
    this.onMessage("cursor", (client, data) => {
      const now = Date.now();
      if (now - (lastCursorTs.get(client.sessionId) ?? 0) < CURSOR_MIN_MS) return;
      lastCursorTs.set(client.sessionId, now);
      relay(client, "cursor", data);
    });

    // Card drag ghost
    this.onMessage("card_drag_start", (client, data) => {
      lastDragTs.set(client.sessionId, 0); // รีเซ็ตเมื่อเริ่ม drag ใหม่
      relay(client, "card_drag_start", data);
    });
    this.onMessage("card_drag_move", (client, data) => {
      const now = Date.now();
      if (now - (lastDragTs.get(client.sessionId) ?? 0) < DRAG_MIN_MS) return;
      lastDragTs.set(client.sessionId, now);
      relay(client, "card_drag_move", data);
    });
    this.onMessage("card_drag_end", (client, data) => {
      lastDragTs.delete(client.sessionId);
      relay(client, "card_drag_end", data);
    });

    // ──── Attack Line (ลากเส้นโจมตีชั่วคราว ไม่เก็บใน state) ────
    this.onMessage("attack_line", (client, data) => {
      relay(client, "attack_line", data);
    });

    // ──── Meta ────
    this.onMessage("shuffle", (client, data) => {
      relay(client, "shuffle", data);
    });
    this.onMessage("log", (client, data) => {
      relay(client, "log", data);
    });
    this.onMessage("dice_result", (client, data) => {
      relay(client, "dice_result", data);
    });

    // ──── Hello handshake ────
    this.onMessage("hello", (client, data) => {
      const ps = this.getPlayerState(client);
      if (ps) ps.name = data.name ?? "Player";
      relay(client, "hello", { name: data.name, sessionId: client.sessionId });
    });
    this.onMessage("hello_ack", (client, data) => {
      relay(client, "hello_ack", { name: data.name, sessionId: client.sessionId });
    });

    // ──── Client ready (ส่งมาหลัง assign_role ตอบกลับ) ────
    const readyClients = new Set<string>();
    let gameStarted = false; // ป้องกัน game_start ถูก broadcast ซ้ำตอน reconnect
    this.onMessage("client_ready", (client, data) => {
      // ถ้าเกมเริ่มไปแล้ว (client reconnect กลับมา) → ส่ง game_restore เฉพาะคนนั้น
      // ไม่ broadcast game_start ซึ่งจะ trigger resetBoard() ฝั่ง client
      if (gameStarted) {
        console.log(`[${this.roomId}] client_ready after game started — sending game_restore to ${client.sessionId}`);
        client.send("game_restore", {});
        return;
      }
      readyClients.add(client.sessionId);
      console.log(`[${this.roomId}] client_ready: ${client.sessionId} (${readyClients.size}/2)`);
      // เมื่อทั้ง 2 คน ready แล้วค่อย broadcast game_start
      if (readyClients.size >= 2) {
        gameStarted = true;
        this.broadcast("game_start", {});
      }
    });

    // ──── New game (รีเซ็ตบอร์ดโดยเจตนา) ────
    // reset gameStarted + readyClients → ให้ client_ready cycle ใหม่ทำงานได้อีกครั้ง
    this.onMessage("new_game", (client, data) => {
      relay(client, "new_game", data);
      readyClients.clear();
      gameStarted = false;
      // broadcast game_start ให้ทั้งคู่รีเซ็ตบอร์ด
      this.broadcast("game_start", {});
    });

  }

  private getPlayerState(client: Client): PlayerState | null {
    if (this.state.player1SessionId === client.sessionId) return this.state.player1;
    if (this.state.player2SessionId === client.sessionId) return this.state.player2;
    return null;
  }

  onJoin(client: Client, options: any) {
    console.log(`[${this.roomId}] ${client.sessionId} joined`);

    // ถ้า sessionId นี้เป็นคนที่ reconnect กลับมา → ไม่ต้องทำอะไร (state ยังอยู่ครบ)
    const isReconnecting =
      this.state.player1SessionId === client.sessionId ||
      this.state.player2SessionId === client.sessionId;

    if (!isReconnecting) {
      if (!this.state.player1SessionId) {
        this.state.player1SessionId = client.sessionId;
        this.state.player1.name = options?.name ?? "Player 1";
      } else {
        this.state.player2SessionId = client.sessionId;
        this.state.player2.name = options?.name ?? "Player 2";
      }
    } else {
      console.log(`[${this.roomId}] ${client.sessionId} is reconnecting — skipping slot reassignment`);
    }
    // แจ้ง client ตัวเองว่าเป็น player1 หรือ player2
    const isHost = this.state.player1SessionId === client.sessionId;
    client.send("assign_role", {
      isHost,
      sessionId: client.sessionId,
      playerCount: this.clients.length,
    });

    // ถ้าครบ 2 คน — แจ้ง game_ready แต่รอ client_ready ก่อนค่อย start
    if (this.clients.length === 2) {
      this.broadcast("game_ready", {
        player1: { sessionId: this.state.player1SessionId, name: this.state.player1.name },
        player2: { sessionId: this.state.player2SessionId, name: this.state.player2.name },
      });
      // ไม่ broadcast game_start ที่นี่ — รอ client ส่ง client_ready กลับมาทั้งคู่ก่อน
    }
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`[${this.roomId}] ${client.sessionId} left (consented=${consented}) — ยุบห้องทันที`);
    // ไม่ว่าจะออกเองหรือหลุดการเชื่อมต่อ → broadcast แจ้งอีกฝั่งแล้วยุบห้องทันที
    this.broadcast("player_left", { sessionId: client.sessionId });
    this.disconnect();
  }

  onDispose() {
    console.log(`[${this.roomId}] room disposing`);
  }
}

const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("card_game", CardGameRoom).filterBy(["roomId"]);

app.use("/colyseus", monitor());

gameServer.listen(port);
console.log(`🎮 CardSim server listening on ws://localhost:${port}`);
