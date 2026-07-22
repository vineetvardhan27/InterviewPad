import express from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { signToken } from "../middleware/auth.js";
import { isDBConnected } from "../config/db.js";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/register", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available — guest mode only" });
  }

  const { username, email, password, role } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email, and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ message: "Username must be 2-30 characters" });
  }

  if (!role || !['interviewer', 'candidate'].includes(role)) {
    return res.status(400).json({ message: "Invalid role specified" });
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
    const user = await User.create({ username, email, passwordHash, role, authProvider: "local" });
    const token = signToken({ id: user._id.toString(), username: user.username, email: user.email, role: user.role });

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

    if (!user.passwordHash) {
      return res.status(401).json({ message: "This account uses Google Sign-In. Please sign in with Google." });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ id: user._id.toString(), username: user.username, email: user.email, role: user.role });
    return res.json({ token, user: user.toPublic() });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.post("/google", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available — guest mode only" });
  }

  const { credential, role } = req.body || {};
  if (!credential) {
    return res.status(400).json({ message: "Google credential is required" });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: "Google Sign-In is not configured on this server" });
  }

  const selectedRole = role && ['interviewer', 'candidate'].includes(role) ? role : 'candidate';

  try {
    // Verify ID token server-side using google-auth-library
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    // Reject accounts with unverified emails
    if (!payload.email_verified) {
      return res.status(401).json({ message: "Google account email is not verified" });
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name || payload.given_name || email.split("@")[0];
    const picture = payload.picture || null;

    // Look up existing user by email
    let user = await User.findOne({ email });

    if (user) {
      // Auto-link: existing local account found, attach googleId (leave passwordHash untouched)
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.picture) user.picture = picture;
        await user.save();
      } else if (picture && !user.picture) {
        // Already linked Google user — keep picture fresh
        user.picture = picture;
        await user.save();
      }
    } else {
      // New user — derive username from name, deduplicate if taken
      let username = name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 25);
      if (username.length < 2) username = `user_${Date.now().toString().slice(-6)}`;

      const existingName = await User.findOne({ username });
      if (existingName) {
        username = `${username}_${Math.floor(Math.random() * 9000) + 1000}`;
      }

      user = await User.create({
        username,
        email,
        googleId,
        picture,
        role: selectedRole,
        authProvider: "google"
      });
    }

    // Issue the same JWT structure and expiry as the AUTH-01 flow
    const token = signToken({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role
    });

    return res.json({ token, user: user.toPublic() });
  } catch (error) {
    console.error("Google Auth error:", error.message);
    return res.status(401).json({ message: "Google authentication failed. Please try again." });
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
