
# Face Recognition Demo (face-api.js + Express)

This demo runs in the browser, uses **face-api.js** to compute face descriptors, and an **Express** server
to store user descriptor vectors in `public/users.json`.

**Features**
- Opens webcam and detects faces.
- Computes 128-d face descriptors and compares to stored users.
- If a face does not match existing users (threshold), server assigns a new user id (`user1`, `user2`, ...).
- New user descriptors are saved to `public/users.json`.
- Labels faces on the camera overlay (supports multiple faces simultaneous).

**Notes**
- This project uses `face-api.js` (client-side) rather than ml5.js because face-api provides direct face descriptors needed for recognition.
- Models are downloaded automatically by the server on first run into `public/models`. This requires internet.

## How to run

1. Install dependencies:
```bash
npm install
```

2. Start the server (will download models if missing):
```bash
npm start
```

3. Open `http://localhost:3000` in Chrome/Edge/Firefox and allow camera access.

4. `public/users.json` will be updated as new users are registered.

## File structure
- server.js           (Express server + model downloader)
- package.json
- public/
  - index.html
  - script.js
  - styles.css
  - users.json
  - models/            (downloaded at runtime)

