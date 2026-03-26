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

// ✅ YOUR SUPABASE CONFIG
const supabase = createClient(
  "https://glbkettiwejweqfhhros.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsYmtldHRpd2Vqd2VxZmhocm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzQwMTUsImV4cCI6MjA5MDExMDAxNX0.1Dmt6fzX7L3B-OvtGfqoeOa2hm8isbMXpjeDA2fyEG8"
);

// Socket
io.on("connection", (socket) => {
  console.log("User connected");

  // Load old messages
  socket.on("loadMessages", async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("id", { ascending: true });

    if (!error) {
      socket.emit("oldMessages", data);
    }
  });

  // Send message
  socket.on("sendMessage", async (msgData) => {
    const { username, message } = msgData;

    await supabase.from("messages").insert([
      { username, message }
    ]);

    io.emit("receiveMessage", msgData);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
