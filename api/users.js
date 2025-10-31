const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    try {
      // In Vercel, we need to use a different path for files
      // Using /tmp for writable storage, but it's ephemeral
      // For production, use Vercel KV or a database
      const usersFile = path.join("/tmp", "users.json");

      if (fs.existsSync(usersFile)) {
        const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
        return res.json(users);
      } else {
        // Return empty array if file doesn't exist
        return res.json([]);
      }
    } catch (e) {
      console.error("Error reading users:", e);
      return res.status(500).json({ error: "Failed to read users" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
