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
    // Use /tmp for writable storage in Vercel (ephemeral)
    // NOTE: This data will be lost when function cold starts
    // For production, use Vercel KV, Upstash, or a database
    const usersFile = path.join("/tmp", "users.json");

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const newId = "user" + (users.length + 1);
    users.push({ id: newId, descriptors: [] });
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    return res.json({ id: newId });
  } catch (e) {
    console.error("register error", e);
    return res.status(500).json({ error: "register failed" });
  }
};
