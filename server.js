const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3001;
const USERS_FILE = path.join(__dirname, "public", "users.json");
const MODELS_DIR = path.join(__dirname, "public", "models");

app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Ensure users.json exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// Helper to download models if missing
const MODEL_BASE =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

async function downloadIfMissing() {
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR);

  // Download the manifest and shards by fetching manifest JSON and then corresponding .bin shards automatically.
  const manifests = [
    "ssd_mobilenetv1_model-weights_manifest.json",
    "face_landmark_68_model-weights_manifest.json",
    "face_recognition_model-weights_manifest.json",
  ];

  // First, check what files we have and what we need
  const existingFiles = new Set(fs.readdirSync(MODELS_DIR));
  let needDownload = false;
  const requiredShards = new Set();

  // Read manifests to determine required shard files
  for (const m of manifests) {
    const manifestPath = path.join(MODELS_DIR, m);
    if (!fs.existsSync(manifestPath)) {
      needDownload = true;
      continue;
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      for (const entry of manifest) {
        if (entry.paths && Array.isArray(entry.paths)) {
          for (const shardPath of entry.paths) {
            requiredShards.add(shardPath);
            if (!existingFiles.has(shardPath)) {
              needDownload = true;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error reading manifest", m, e);
      needDownload = true;
    }
  }

  // If all files exist, skip download
  if (!needDownload) {
    console.log("All model files present; skipping download.");
    return;
  }

  console.log(
    "Downloading face-api.js models to public/models (this may take a while)..."
  );

  // Download manifests and shards
  for (const m of manifests) {
    const url = `${MODEL_BASE}/${m}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Failed to fetch", url, res.status);
      continue;
    }
    const text = await res.text();
    fs.writeFileSync(path.join(MODELS_DIR, m), text);
    console.log("Downloaded manifest:", m);

    // parse manifest to download shard files
    try {
      const manifest = JSON.parse(text);
      for (const entry of manifest) {
        if (entry.paths && Array.isArray(entry.paths)) {
          for (const shardPath of entry.paths) {
            const shardUrl = `${MODEL_BASE}/${shardPath}`;
            const shardRes = await fetch(shardUrl);
            if (!shardRes.ok) {
              console.error("Failed to fetch", shardUrl, shardRes.status);
              continue;
            }
            const arrayBuffer = await shardRes.arrayBuffer();
            fs.writeFileSync(
              path.join(MODELS_DIR, shardPath),
              Buffer.from(arrayBuffer)
            );
            console.log("Downloaded shard:", shardPath);
          }
        }
      }
    } catch (e) {
      console.error("Manifest parse error for", m, e);
    }
  }
  console.log("Model download finished.");
}

app.get("/users.json", (req, res) => {
  res.sendFile(USERS_FILE);
});

app.post("/save", (req, res) => {
  // payload: { id: "user1", descriptor: [ ...numbers... ] }
  try {
    const payload = req.body;
    if (!payload || !payload.id || !payload.descriptor) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    let existing = users.find((u) => u.id === payload.id);
    if (!existing) {
      users.push({ id: payload.id, descriptors: [payload.descriptor] });
    } else {
      // append descriptor to user's descriptor list
      if (!existing.descriptors) {
        existing.descriptors = [];
      }
      existing.descriptors.push(payload.descriptor);
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return res.json({ ok: true, usersCount: users.length });
  } catch (e) {
    console.error("Save error", e);
    return res.status(500).json({ error: "save failed" });
  }
});

app.post("/register_new", (req, res) => {
  // client asks server for a new id string
  try {
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    const newId = "user" + (users.length + 1);
    // create entry with empty descriptors, client will POST /save with descriptor shortly
    users.push({ id: newId, descriptors: [] });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return res.json({ id: newId });
  } catch (e) {
    console.error("register error", e);
    return res.status(500).json({ error: "register failed" });
  }
});

// start server and download models if needed
downloadIfMissing()
  .catch((e) => console.error("Model download failed:", e))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
