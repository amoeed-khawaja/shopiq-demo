const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get category from URL parameter (Vercel dynamic routes use req.query with the folder name as key)
    // For route /api/ads/[category].js, access via req.query.category
    const category = req.query.category;
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

    // In Vercel, files in the repo are available via process.cwd()
    let folderPath;
    const basePath = process.cwd();

    if (req.query.gender && folderName === "adults") {
      folderPath = path.join(
        basePath,
        "asset",
        "ads",
        folderName,
        req.query.gender.toLowerCase()
      );
    } else {
      folderPath = path.join(basePath, "asset", "ads", folderName);
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
};
