const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

// ✅ USE ENV VARIABLES (IMPORTANT FOR RENDER)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Basic route (so browser doesn't show error)
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Socket connection
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
    } else {
      console.log(error);
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

// ✅ REQUIRED FOR RENDER
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
