import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "interviewpad-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Express middleware — attaches req.user = { id, username, email }.
 * Passes through if no DB is connected (guest mode fallback).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const token = header.slice(7);
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, username: decoded.username, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * Optional auth — attaches req.user if token present, otherwise continues as guest.
 */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      const decoded = verifyToken(token);
      req.user = { id: decoded.id, username: decoded.username, email: decoded.email };
    } catch {
      // Invalid token — continue as guest
    }
  }
  return next();
}
