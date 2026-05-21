import express from "express";
import User from "../models/User.js";
import { signToken } from "../middleware/auth.js";
import { isDBConnected } from "../config/db.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available — guest mode only" });
  }

  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email, and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ message: "Username must be 2-30 characters" });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });
    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? "email" : "username";
      return res.status(409).json({ message: `An account with this ${field} already exists` });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ username, email, passwordHash });
    const token = signToken({ id: user._id.toString(), username: user.username, email: user.email });

    return res.status(201).json({ token, user: user.toPublic() });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available — guest mode only" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ id: user._id.toString(), username: user.username, email: user.email });
    return res.json({ token, user: user.toPublic() });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const { verifyToken } = await import("../middleware/auth.js");
    const decoded = verifyToken(header.slice(7));
    if (!isDBConnected()) {
      return res.json({ user: { id: decoded.id, username: decoded.username, email: decoded.email } });
    }
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user: user.toPublic() });
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
