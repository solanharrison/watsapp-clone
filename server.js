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

// ✅ MIDDLEWARE (IMPORTANT)
app.use(cors());
app.use(express.json());

// ✅ DEBUG ROUTE (TEST THIS FIRST)
app.get("/", (req, res) => {
  res.send("Server working ✅");
});

// ✅ SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// In-memory store
let sessions = {};
let onlineUsers = {};

// ================= AUTH =================

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // check existing user
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from("users")
      .insert([{ username, password: hashed }]);

    if (error) {
      console.log(error);
      return res.status(500).json({ error: "Signup failed" });
    }

    res.json({ message: "Signup success" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (!data) {
      return res.status(401).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(password, data.password);

    if (!valid) {
      return res.status(401).json({ error: "Wrong password" });
    }

    const token = uuidv4();
    sessions[token] = username;

    res.json({ token, username });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Login error" });
  }
});

// ================= SOCKET =================

io.on("connection", (socket) => {

  socket.on("authenticate", (token) => {
    const username = sessions[token];

    if (!username) {
      socket.disconnect();
      return;
    }

    socket.username = username;
    onlineUsers[username] = socket.id;

    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  socket.on("joinChat", ({ withUser }) => {
    const room = [socket.username, withUser].sort().join("_");
    socket.join(room);
  });

  socket.on("loadChat", async ({ withUser }) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender.eq.${socket.username},receiver.eq.${withUser}),and(sender.eq.${withUser},receiver.eq.${socket.username})`
      )
      .order("id", { ascending: true });

    socket.emit("chatHistory", data);
  });

  socket.on("sendMessage", async ({ to, message }) => {
    const sender = socket.username;

    await supabase.from("messages").insert([
      { sender, receiver: to, message }
    ]);

    const room = [sender, to].sort().join("_");

    io.to(room).emit("receiveMessage", {
      sender,
      message
    });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      io.emit("onlineUsers", Object.keys(onlineUsers));
    }
  });
});

// ================= SERVER =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
