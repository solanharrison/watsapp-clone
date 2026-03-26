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

// 🔥 Supabase setup
const supabase = createClient(
  "YOUR_SUPABASE_URL",
  "YOUR_SUPABASE_ANON_KEY"
);

// Socket connection
io.on("connection", (socket) => {
  console.log("User connected");

  // Send old messages
  socket.on("loadMessages", async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .order("id", { ascending: true });

    socket.emit("oldMessages", data);
  });

  // Receive message
  socket.on("sendMessage", async (msgData) => {
    const { username, message } = msgData;

    // Save to DB
    await supabase.from("messages").insert([
      { username, message }
    ]);

    // Broadcast
    io.emit("receiveMessage", msgData);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
