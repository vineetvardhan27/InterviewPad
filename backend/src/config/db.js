import mongoose from "mongoose";

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("MONGO_URI not set – falling back to in-memory store");
    return false;
  }

  if (isConnected) {
    return true;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    isConnected = true;
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    console.warn("MongoDB connection failed – falling back to in-memory store:", error.message);
    return false;
  }
}

export function isDBConnected() {
  return isConnected;
}
