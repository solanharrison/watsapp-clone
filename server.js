const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Test
app.get("/", (req, res) => {
  res.send("Server working ✅");
});

// ================= SOCKET =================

io.on("connection", (socket) => {

  console.log("User connected");

  socket.on("join", (username) => {
    socket.username = username;
    console.log("Joined:", username);
  });

  // Load old messages
  socket.on("loadMessages", async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.log("LOAD ERROR:", error);
      return;
    }

    socket.emit("chatHistory", data || []);
  });

  // Send message
  socket.on("sendMessage", async (message) => {
    const username = socket.username;

    console.log("TRY SAVE:", username, message);

    if (!username || !message) return;

    const { error } = await supabase
      .from("messages")
      .insert([{ username, message }]);

    if (error) {
      console.log("❌ DB ERROR:", error);
      return;
    }

    console.log("✅ SAVED");

    io.emit("receiveMessage", {
      username,
      message
    });

    // Notification (simple)
    socket.broadcast.emit("notification", {
      from: username
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running on " + PORT));
