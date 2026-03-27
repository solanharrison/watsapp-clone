const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

let sessions = {};
let onlineUsers = {};

app.get("/", (req, res) => {
  res.send("Server working ✅");
});

// ===== AUTH =====

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const { error } = await supabase
    .from("users")
    .insert([{ username, password: hashed }]);

  if (error) {
    console.log("SIGNUP ERROR:", error);
    return res.status(400).json({ error: "Signup failed" });
  }

  res.json({ message: "Signup success" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (!data) return res.status(401).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, data.password);
  if (!valid) return res.status(401).json({ error: "Wrong password" });

  const token = uuidv4();
  sessions[token] = username;

  res.json({ token, username });
});

// ===== SOCKET =====

io.on("connection", (socket) => {

  console.log("Socket connected");

  socket.on("authenticate", (token) => {
    const username = sessions[token];

    if (!username) return socket.disconnect();

    socket.username = username;
    onlineUsers[username] = socket.id;

    console.log("User:", username);

    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  socket.on("joinChat", ({ withUser }) => {
    const room = [socket.username, withUser].sort().join("_");
    socket.join(room);
    socket.currentChat = withUser;

    console.log(socket.username, "joined", room);
  });

  socket.on("loadChat", async ({ withUser }) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender.eq.${socket.username},receiver.eq.${withUser}),and(sender.eq.${withUser},receiver.eq.${socket.username})`
      )
      .order("id", { ascending: true });

    if (error) {
      console.log("LOAD ERROR:", error);
      return;
    }

    socket.emit("chatHistory", data || []);
  });

  socket.on("sendMessage", async ({ to, message }) => {
    const sender = socket.username;

    console.log("TRY SAVE:", sender, to, message);

    const { data, error } = await supabase
      .from("messages")
      .insert([{ sender, receiver: to, message }])
      .select();

    if (error) {
      console.log("❌ DB ERROR:", error);
      return;
    }

    console.log("✅ SAVED:", data);

    const room = [sender, to].sort().join("_");

    io.to(room).emit("receiveMessage", {
      sender,
      message
    });

    // direct fallback (important)
    if (onlineUsers[to]) {
      io.to(onlineUsers[to]).emit("receiveMessage", {
        sender,
        message
      });

      if (socket.currentChat !== to) {
        io.to(onlineUsers[to]).emit("notification", {
          from: sender
        });
      }
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      io.emit("onlineUsers", Object.keys(onlineUsers));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running on " + PORT));
