/**
 * One-time migration: import users from data/users.json (or public/users.json) into Supabase.
 * Uses DB-aligned JSON shape: { id, age_category_id, created_at, updated_at, descriptors }.
 * Run: node scripts/migrate-users-to-supabase.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DATA_USERS = path.join(__dirname, "..", "data", "users.json");
const PUBLIC_USERS = path.join(__dirname, "..", "public", "users.json");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const usersFile = fs.existsSync(DATA_USERS) ? DATA_USERS : PUBLIC_USERS;
  if (!fs.existsSync(usersFile)) {
    console.error("Not found: data/users.json or public/users.json");
    process.exit(1);
  }

  const raw = fs.readFileSync(usersFile, "utf8");
  let list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    process.exit(1);
  }

  if (!Array.isArray(list)) {
    console.error("File must be an array of user objects");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  let usersInserted = 0;
  let descriptorsInserted = 0;
  let usersSkipped = 0;

  for (const u of list) {
    if (!u.id || !Array.isArray(u.descriptors)) continue;

    const { error: userError } = await supabase.from("users").upsert(
      {
        id: u.id,
        age_category_id: u.age_category_id ?? null,
        created_at: u.created_at || new Date().toISOString(),
        updated_at: u.updated_at || new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (userError) {
      console.warn("User", u.id, ":", userError.message);
      usersSkipped++;
      continue;
    }
    usersInserted++;

    await supabase.from("user_descriptors").delete().eq("user_id", u.id);

    for (const descriptor of u.descriptors) {
      const { error: descError } = await supabase.from("user_descriptors").insert({
        user_id: u.id,
        descriptor,
      });
      if (descError) {
        console.warn("Descriptor for", u.id, ":", descError.message);
      } else {
        descriptorsInserted++;
      }
    }
  }

  console.log("Done. Users upserted:", usersInserted, "| Skipped:", usersSkipped, "| Descriptors inserted:", descriptorsInserted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
