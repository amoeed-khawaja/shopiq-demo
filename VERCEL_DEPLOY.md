# Vercel Deployment Guide

This guide will walk you through deploying the Face Recognition Demo to Vercel.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup) (free tier works)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
3. Node.js installed locally (for testing)

## Important Notes

⚠️ **Data Persistence**: The current implementation uses `/tmp` directory for storing `users.json`, which is **ephemeral** (data is lost when functions cold start). For production use:

- **Vercel KV** (recommended for simple key-value storage)
- **Vercel Postgres** (for relational data)
- **Upstash** (Redis-compatible)
- Or any external database

The model files and assets are served as static files and will persist.

## Step-by-Step Deployment

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to Git**

   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Go to Vercel Dashboard**

   - Visit [vercel.com/new](https://vercel.com/new)
   - Sign in with your GitHub/GitLab/Bitbucket account

3. **Import your repository**

   - Click "Import Project"
   - Select your repository
   - Click "Import"

4. **Configure project settings**

   - **Framework Preset**: Other (or leave as default)
   - **Root Directory**: `./` (default)
   - **Build Command**: Leave empty (no build needed)
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install` (default)

5. **Add Environment Variables** (if needed)

   - Usually not required for this project
   - Click "Environment Variables" if you need to add any

6. **Deploy**

   - Click "Deploy"
   - Wait for the build to complete (usually 1-2 minutes)

7. **Access your site**
   - Once deployed, you'll get a URL like `your-project.vercel.app`
   - Your site is live!

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**

   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**

   ```bash
   vercel login
   ```

3. **Navigate to your project**

   ```bash
   cd face_recognition_demo
   ```

4. **Deploy**

   ```bash
   vercel
   ```

   - Follow the prompts:
     - Set up and deploy? **Yes**
     - Which scope? (Select your account)
     - Link to existing project? **No** (first time)
     - Project name? (Press Enter for default)
     - Directory? (Press Enter for default `./`)
     - Override settings? **No**

5. **Deploy to production**
   ```bash
   vercel --prod
   ```

### Method 3: Connect Git Repository (Automatic Deployments)

1. **Go to Vercel Dashboard** → **Add New Project**

2. **Import from Git**

   - Connect your Git provider (GitHub/GitLab/Bitbucket)
   - Select your repository
   - Configure settings (same as Method 1)

3. **Automatic deployments**
   - Every push to `main` branch will trigger a new deployment
   - Pull requests get preview deployments automatically

## Post-Deployment Steps

### 1. Update Client-Side URLs (if needed)

The client code should automatically work, but verify:

- API calls use relative paths (`/api/...`) ✅ (already configured)
- Asset paths use relative paths (`/asset/...`) ✅ (already configured)
- Model paths use relative paths (`/models/...`) ✅ (already configured)

### 2. Test Your Deployment

1. Visit your Vercel URL
2. Open the browser console (F12)
3. Check for any errors
4. Test face detection functionality

### 3. Set Up Custom Domain (Optional)

1. Go to your project in Vercel Dashboard
2. Click **Settings** → **Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

## Troubleshooting

### Issue: "Module not found" errors

**Solution**: Ensure all dependencies are in `package.json` and committed to Git.

### Issue: API routes returning 404

**Solution**: Check `vercel.json` routing configuration. Verify API files are in the `api/` directory.

### Issue: Static files not loading

**Solution**:

- Ensure files are in `public/` directory
- Check `vercel.json` routes configuration
- Verify file paths in HTML/CSS/JS

### Issue: Users.json not persisting

**Solution**: This is expected with the current setup. Implement Vercel KV or a database:

```javascript
// Example with Vercel KV
import { kv } from "@vercel/kv";

// Save users
await kv.set("users", JSON.stringify(users));

// Get users
const users = JSON.parse((await kv.get("users")) || "[]");
```

### Issue: Large model files timeout

**Solution**: Model files are served as static files, which should work fine. If issues persist, consider:

- Using a CDN for model files
- Reducing model file sizes
- Checking Vercel's file size limits

## Project Structure for Vercel

```
face_recognition_demo/
├── api/                    # Serverless functions
│   ├── users.js          # GET /users.json
│   ├── save.js            # POST /api/save
│   ├── register_new.js    # POST /api/register_new
│   └── ads/
│       └── [category].js  # GET /api/ads/:category
├── public/                # Static files
│   ├── index.html
│   ├── category.html
│   ├── script.js
│   ├── styles.css
│   ├── models/           # ML model files
│   └── logo-light.png
├── asset/                 # Static assets
│   ├── ads/              # Advertisement images
│   └── logo-light.png
├── vercel.json           # Vercel configuration
├── package.json
└── README.md
```

## Updating Your Deployment

After making changes:

1. **Git push** (for automatic deployments)

   ```bash
   git add .
   git commit -m "Update feature"
   git push
   ```

2. **Or redeploy via CLI**
   ```bash
   vercel --prod
   ```

## Environment Variables (Optional)

If you need environment variables:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add variables (e.g., `API_KEY`, `DATABASE_URL`)
3. Access in code: `process.env.API_KEY`

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Discord](https://vercel.com/discord)
- [Vercel GitHub Discussions](https://github.com/vercel/vercel/discussions)

---

**Note**: The free tier of Vercel includes:

- Unlimited deployments
- 100GB bandwidth per month
- Serverless function execution (with limits)
- Automatic HTTPS

For production with high traffic, consider upgrading to a paid plan.
