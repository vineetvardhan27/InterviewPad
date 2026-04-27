const buckets = new Map();

function getRequestIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "anonymous";
}

export function createRateLimiter({ windowMs, maxRequests, message }) {
  return function rateLimiter(req, res, next) {
    const ip = getRequestIp(req);
    const now = Date.now();
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        message,
        retryAfterMs: Math.max(entry.resetAt - now, 0)
      });
    }

    entry.count += 1;
    return next();
  };
}
