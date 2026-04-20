require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3002;
const MODELS_DIR = path.join(__dirname, "public", "models");
const DATA_DIR = path.join(__dirname, "data");
const DATA_USERS_FILE = path.join(DATA_DIR, "users.json");
const DATA_ZONE_EVENTS_FILE = path.join(DATA_DIR, "zone_events.json");
const DATA_ZONES_FILE = path.join(DATA_DIR, "zones.json");
const PUBLIC_USERS_LEGACY = path.join(__dirname, "public", "users.json");
const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

const useSupabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = useSupabase
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;
if (!useSupabase) {
  console.warn(
    "Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). DB sync disabled."
  );
}

app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/asset", express.static(path.join(__dirname, "asset")));

// --- File-first store (DB-aligned JSON). All writes go here first; DB sync runs periodically. ---
// User shape for DB: { id, age_category_id, created_at, updated_at, descriptors, interests }
function normalizeUser(u) {
  return {
    id: u.id,
    age_category_id: u.age_category_id ?? null,
    created_at: u.created_at ?? null,
    updated_at: u.updated_at ?? null,
    descriptors: Array.isArray(u.descriptors) ? u.descriptors : [],
    interests: Array.isArray(u.interests) ? u.interests : [],
  };
}

let usersStore = [];
let zoneEventsBuffer = [];
let zonesStore = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsersFromFile() {
  ensureDataDir();
  if (!fs.existsSync(DATA_USERS_FILE)) {
    if (fs.existsSync(PUBLIC_USERS_LEGACY)) {
      try {
        const raw = JSON.parse(fs.readFileSync(PUBLIC_USERS_LEGACY, "utf8"));
        const arr = Array.isArray(raw) ? raw : [];
        usersStore = arr.map(normalizeUser);
        persistUsersToFile();
        console.log("Migrated", usersStore.length, "users from public/users.json to data/users.json");
      } catch (e) {
        console.error("Migration from public/users.json failed:", e.message);
        usersStore = [];
      }
    } else {
      usersStore = [];
    }
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_USERS_FILE, "utf8"));
    const arr = Array.isArray(raw) ? raw : [];
    usersStore = arr.map(normalizeUser);
  } catch (e) {
    console.error("Load users.json error:", e.message);
    usersStore = [];
  }
}

function persistUsersToFile() {
  ensureDataDir();
  fs.writeFileSync(DATA_USERS_FILE, JSON.stringify(usersStore, null, 2), "utf8");
}

function loadZoneEventsFromFile() {
  ensureDataDir();
  if (!fs.existsSync(DATA_ZONE_EVENTS_FILE)) {
    zoneEventsBuffer = [];
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_ZONE_EVENTS_FILE, "utf8"));
    zoneEventsBuffer = Array.isArray(raw) ? raw : [];
  } catch (e) {
    zoneEventsBuffer = [];
  }
}

function persistZoneEventsToFile() {
  ensureDataDir();
  fs.writeFileSync(DATA_ZONE_EVENTS_FILE, JSON.stringify(zoneEventsBuffer, null, 2), "utf8");
}

const DEFAULT_ZONES = [
  { id: "zone1", slug: "zone1", name: "Left Store", store_name: "Tech Corner", zone_category: "Electronics", color: "rgba(74, 222, 128, 0.25)", stroke: "#4ade80", points: [[0, 0], [0.2, 0], [0.2, 1], [0, 1]] },
  { id: "zone2", slug: "zone2", name: "Right Store", store_name: "Style Hub", zone_category: "Fashion", color: "rgba(59, 130, 246, 0.25)", stroke: "#3b82f6", points: [[0.8, 0], [1, 0], [1, 1], [0.8, 1]] },
];

function loadZonesFromFile() {
  ensureDataDir();
  if (!fs.existsSync(DATA_ZONES_FILE)) {
    zonesStore = DEFAULT_ZONES.slice();
    persistZonesToFile();
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_ZONES_FILE, "utf8"));
    zonesStore = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error("Load zones.json error:", e.message);
    zonesStore = [];
  }
}

function persistZonesToFile() {
  ensureDataDir();
  fs.writeFileSync(DATA_ZONES_FILE, JSON.stringify(zonesStore, null, 2), "utf8");
}

loadUsersFromFile();
loadZoneEventsFromFile();
loadZonesFromFile();

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
    "age_gender_model-weights_manifest.json",
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

app.get("/api/zones", (req, res) => {
  res.json(zonesStore);
});

// Always serve from file-first store (seamless; DB sync runs in background)
app.get("/users.json", (req, res) => {
  const result = usersStore.map((u) => ({
    id: u.id,
    descriptors: u.descriptors || [],
  }));
  res.json(result);
});

app.post("/save", (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.id || !payload.descriptor) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    let existing = usersStore.find((u) => u.id === payload.id);
    const now = new Date().toISOString();
    if (!existing) {
      usersStore.push({
        id: payload.id,
        age_category_id: null,
        created_at: now,
        updated_at: now,
        descriptors: [payload.descriptor],
        interests: [],
      });
    } else {
      if (!existing.descriptors) existing.descriptors = [];
      existing.descriptors.push(payload.descriptor);
      existing.updated_at = now;
    }
    persistUsersToFile();
    return res.json({ ok: true, usersCount: usersStore.length });
  } catch (e) {
    console.error("Save error", e);
    return res.status(500).json({ error: "save failed" });
  }
});

app.post("/api/zone-enter", (req, res) => {
  try {
    const { userId, zoneId, zoneName, timestamp } = req.body || {};
    const name = zoneName || zoneId || "zone";
    const ts = timestamp || new Date().toISOString();
    console.log(`${userId || "user"} entered ${name} at ${ts}`);

    const zone = zonesStore.find((z) => z.id === zoneId || z.slug === zoneId);
    const zone_category = zone ? zone.zone_category : null;
    if (userId && userId !== "guest" && zone_category) {
      const user = usersStore.find((u) => u.id === userId);
      if (user) {
        if (!user.interests) user.interests = [];
        if (!user.interests.includes(zone_category)) {
          user.interests.push(zone_category);
          persistUsersToFile();
        }
      }
    }

    const isUuid =
      zoneId &&
      typeof zoneId === "string" &&
      /^[0-9a-f-]{36}$/i.test(zoneId);
    zoneEventsBuffer.push({
      user_id: userId || "guest",
      zone_id: isUuid ? zoneId : null,
      zone_name: name,
      event: "enter",
      created_at: ts,
      zone_category: zone_category || null,
    });
    persistZoneEventsToFile();
    return res.json({ ok: true });
  } catch (e) {
    console.error("Zone enter log error", e);
    return res.status(500).json({ error: "log failed" });
  }
});

app.post("/register_new", (req, res) => {
  try {
    const newId = "user" + (usersStore.length + 1);
    const now = new Date().toISOString();
    usersStore.push({
      id: newId,
      age_category_id: null,
      created_at: now,
      updated_at: now,
      descriptors: [],
      interests: [],
    });
    persistUsersToFile();
    return res.json({ id: newId });
  } catch (e) {
    console.error("register error", e);
    return res.status(500).json({ error: "register failed" });
  }
});

app.get("/api/ads/:category", (req, res) => {
  // Return list of image files for a category
  try {
    const category = req.params.category;
    const categoryFolderMap = {
      kids: "kids",
      teen: "teen",
      "young-adults": "young adults",
      adults: "adults",
      "senior-adults": "senior adults",
      common: "common",
    };

    const folderName = categoryFolderMap[category];
    if (!folderName) {
      return res.json({ images: [] });
    }

    let folderPath;
    if (req.query.gender && folderName === "adults") {
      folderPath = path.join(
        __dirname,
        "asset",
        "ads",
        folderName,
        req.query.gender.toLowerCase()
      );
    } else {
      folderPath = path.join(__dirname, "asset", "ads", folderName);
    }

    if (!fs.existsSync(folderPath)) {
      return res.json({ images: [] });
    }

    const files = fs.readdirSync(folderPath);
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    const imageFiles = files
      .filter((file) =>
        imageExtensions.some((ext) => file.toLowerCase().endsWith(ext))
      )
      .map((file) => {
        if (req.query.gender && folderName === "adults") {
          return `/asset/ads/${folderName}/${req.query.gender.toLowerCase()}/${file}`;
        }
        return `/asset/ads/${folderName}/${file}`;
      });

    return res.json({ images: imageFiles });
  } catch (e) {
    console.error("Error listing ads:", e);
    return res.status(500).json({ error: "Failed to list ads" });
  }
});

async function syncToSupabase() {
  if (!useSupabase) return;
  try {
    for (const z of zonesStore) {
      await supabase.from("zones").upsert(
        {
          slug: z.slug || z.id,
          name: z.name,
          zone_category: z.zone_category,
          store_name: z.store_name,
          color: z.color,
          stroke: z.stroke,
          points: z.points,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" }
      );
    }
    for (const u of usersStore) {
      await supabase.from("users").upsert(
        {
          id: u.id,
          age_category_id: u.age_category_id,
          created_at: u.created_at || new Date().toISOString(),
          updated_at: u.updated_at || new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      await supabase.from("user_descriptors").delete().eq("user_id", u.id);
      for (const descriptor of u.descriptors || []) {
        await supabase.from("user_descriptors").insert({
          user_id: u.id,
          descriptor,
        });
      }
      for (const category of u.interests || []) {
        await supabase.from("user_interests").upsert(
          {
            user_id: u.id,
            category,
            first_entered_at: u.updated_at || new Date().toISOString(),
            created_at: u.updated_at || new Date().toISOString(),
          },
          { onConflict: "user_id,category", ignoreDuplicates: true }
        );
      }
    }
    const toSync = zoneEventsBuffer.slice();
    zoneEventsBuffer = [];
    persistZoneEventsToFile();
    for (const ev of toSync) {
      await supabase.from("zone_events").insert({
        user_id: ev.user_id,
        zone_id: ev.zone_id,
        zone_name: ev.zone_name,
        event: ev.event,
        created_at: ev.created_at,
      });
      const category = ev.zone_category || (ev.zone_id && (await supabase.from("zones").select("zone_category").eq("id", ev.zone_id).single()).data?.zone_category);
      if (category && ev.user_id && ev.user_id !== "guest") {
        await supabase.from("user_interests").upsert(
          {
            user_id: ev.user_id,
            category,
            zone_id: ev.zone_id,
            first_entered_at: ev.created_at,
            created_at: ev.created_at,
          },
          { onConflict: "user_id,category", ignoreDuplicates: true }
        );
      }
    }
    if (usersStore.length > 0 || toSync.length > 0 || zonesStore.length > 0) {
      console.log("[Sync] DB updated: users=" + usersStore.length + ", zones=" + zonesStore.length + ", zone_events=" + toSync.length);
    }
  } catch (e) {
    console.error("[Sync] Error:", e.message);
  }
}

// start server and download models if needed
downloadIfMissing()
  .catch((e) => console.error("Model download failed:", e))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      if (useSupabase) {
        setInterval(syncToSupabase, SYNC_INTERVAL_MS);
        console.log("DB sync every", SYNC_INTERVAL_MS / 60000, "minutes");
      }
    });
  });
