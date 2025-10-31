const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body;
    if (!payload || !payload.id || !payload.descriptor) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Use /tmp for writable storage in Vercel (ephemeral)
    // NOTE: This data will be lost when function cold starts
    // For production, use Vercel KV, Upstash, or a database
    const usersFile = path.join("/tmp", "users.json");

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    let existing = users.find((u) => u.id === payload.id);
    if (!existing) {
      users.push({ id: payload.id, descriptors: [payload.descriptor] });
    } else {
      if (!existing.descriptors) {
        existing.descriptors = [];
      }
      existing.descriptors.push(payload.descriptor);
    }

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    return res.json({ ok: true, usersCount: users.length });
  } catch (e) {
    console.error("Save error", e);
    return res.status(500).json({ error: "save failed" });
  }
};
