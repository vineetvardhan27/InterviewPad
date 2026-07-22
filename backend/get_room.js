import mongoose from "mongoose";
import "dotenv/config";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/interviewpad";

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const rooms = await db.collection("rooms").find().sort({ createdAt: -1 }).limit(1).toArray();
  if (rooms.length > 0) {
    console.log("Latest room:", rooms[0].roomId);
    console.log("Host:", rooms[0].host);
    console.log("Users:", rooms[0].users);
  } else {
    console.log("No rooms found");
  }
  process.exit(0);
}

run().catch(console.error);
