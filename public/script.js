// Client-side script: loads face-api models from /models, opens webcam, detects faces and descriptors,
// matches to stored users, and calls server to register new users and save descriptors.

const video = document.getElementById("inputVideo");
const canvas = document.getElementById("overlay");
const log = document.getElementById("log");
let users = []; // loaded from server: [{id, descriptors: [[...], ...]}, ...]
const THRESHOLD = 0.55; // distance threshold for recognition (lower = stricter)

async function init() {
  try {
    log.innerText = "Loading face recognition models...";
    await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    log.innerText = "Models loaded successfully!";
    await loadUsers();
    await startVideo();
  } catch (e) {
    log.innerText = "Error loading models: " + e.message;
    console.error("Init error", e);
  }
}

async function loadUsers() {
  try {
    const res = await fetch("/users.json");
    users = await res.json();
    if (users && users.length > 0) {
      log.innerText = `Loaded ${users.length} stored users: ${users
        .map((u) => u.id)
        .join(", ")}`;
    } else {
      log.innerText =
        "Ready. No users registered yet. Face the camera to register.";
    }
  } catch (e) {
    console.error("Failed loading users", e);
    users = [];
    log.innerText = "Ready. Face the camera to register.";
  }
}

async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      // Ensure canvas dimensions match video dimensions exactly
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Set display size to match video display size
      canvas.style.width = video.offsetWidth + "px";
      canvas.style.height = video.offsetHeight + "px";
      log.innerText = `Camera active. Detecting faces... (${users.length} users loaded)`;
      // Start detection immediately using requestAnimationFrame for smooth animation
      requestAnimationFrame(() => detectLoop());
    };
    video.onerror = (e) => {
      log.innerText = "Video error: " + e;
      console.error("Video error", e);
    };
  } catch (e) {
    log.innerText =
      "Cannot access camera: " + e.message + ". Please allow camera access.";
    console.error("Camera access error", e);
  }
}

function drawBox(box, label, score) {
  const ctx = canvas.getContext("2d");

  // Calculate flipped x coordinate to match the flipped video
  // Video is flipped with CSS scaleX(-1), so we need to mirror x coordinates
  const flippedX = canvas.width - box.x - box.width;

  // Draw bounding box
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#00FF00";
  ctx.strokeRect(flippedX, box.y, box.width, box.height);

  // Draw label background
  const txt =
    label +
    (score !== undefined && score > 0 ? " (" + score.toFixed(2) + ")" : "");
  ctx.font = "bold 16px Arial";
  const textMetrics = ctx.measureText(txt);
  const textWidth = textMetrics.width;
  const textHeight = 20;

  ctx.fillStyle = "rgba(0, 150, 0, 0.8)";
  ctx.fillRect(flippedX, box.y - textHeight - 2, textWidth + 12, textHeight);

  // Draw label text normally (canvas is not flipped, so text renders correctly)
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, flippedX + 6, box.y - 6);
}

function clearCanvas() {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "16px Arial";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#00FF00";
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function findBestMatch(descriptor) {
  if (!users || users.length === 0) return { distance: Infinity, user: null };
  let best = { distance: Infinity, user: null };
  for (const u of users) {
    // compare to each descriptor sample of user, take min
    for (const sample of u.descriptors || []) {
      const dist = euclideanDistance(descriptor, sample);
      if (dist < best.distance) {
        best.distance = dist;
        best.user = u;
      }
    }
  }
  return best;
}

let registeringUsers = new Set(); // Track users being registered to prevent duplicates
let lastRegistrationTime = 0;
const REGISTRATION_COOLDOWN = 3000; // Don't register new users more than once every 3 seconds

function registerNewUser(descriptor) {
  // Prevent multiple simultaneous registrations
  const now = Date.now();
  if (now - lastRegistrationTime < REGISTRATION_COOLDOWN) {
    return null;
  }
  lastRegistrationTime = now;

  // ask server for new id (non-blocking)
  fetch("/register_new", { method: "POST" })
    .then((r) => r.json())
    .then((j) => {
      if (j && j.id && !registeringUsers.has(j.id)) {
        registeringUsers.add(j.id);
        // immediately save descriptor (non-blocking)
        fetch("/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: j.id, descriptor }),
        })
          .then(() => {
            // refresh local users in background
            loadUsers().then(() => {
              registeringUsers.delete(j.id);
              // Update display
              log.innerText = `Camera active. Detecting faces... (${
                users.length
              } users: ${users.map((u) => u.id).join(", ")})`;
            });
          })
          .catch((e) => {
            console.error("Save failed", e);
            registeringUsers.delete(j.id);
          });
      }
    })
    .catch((e) => {
      console.error("Register new user failed", e);
    });
}

let processing = false;
let lastUserCount = 0;
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; // Run detection every 200ms for smoother updates
let lastBoxes = []; // Cache previous boxes for smooth interpolation

async function detectLoop() {
  // Check if video is ready
  if (
    video.paused ||
    video.ended ||
    !video.readyState ||
    video.readyState < 2
  ) {
    requestAnimationFrame(detectLoop);
    return;
  }

  // Throttle detection frequency but use requestAnimationFrame for smooth updates
  const now = Date.now();
  const timeSinceLastDetection = now - lastDetectionTime;

  // If detection is running, just update display with cached boxes and continue loop
  if (processing) {
    // Draw cached boxes for smooth visual feedback
    if (lastBoxes.length > 0) {
      clearCanvas();
      for (const cached of lastBoxes) {
        drawBox(cached.box, cached.label, cached.score);
      }
    }
    requestAnimationFrame(detectLoop);
    return;
  }

  // Run detection at specified interval
  if (timeSinceLastDetection < DETECTION_INTERVAL) {
    // Draw cached boxes while waiting
    if (lastBoxes.length > 0) {
      clearCanvas();
      for (const cached of lastBoxes) {
        drawBox(cached.box, cached.label, cached.score);
      }
    }
    requestAnimationFrame(detectLoop);
    return;
  }

  processing = true;
  lastDetectionTime = now;

  try {
    // Run detection asynchronously without blocking the animation loop
    const runDetection = async () => {
      try {
        // Detect faces with landmarks and descriptors
        const detections = await faceapi
          .detectAllFaces(video)
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Resize detections to match canvas dimensions
        const resizedDetections = faceapi.resizeResults(detections || [], {
          width: canvas.width,
          height: canvas.height,
        });

        clearCanvas();
        lastBoxes = []; // Clear cached boxes

        if (resizedDetections && resizedDetections.length > 0) {
          for (const det of resizedDetections) {
            const box = det.detection.box;
            const descriptor = Array.from(det.descriptor);
            const match = findBestMatch(descriptor);

            let label, score;
            if (match.user && match.distance < THRESHOLD) {
              // recognized existing user
              label = match.user.id;
              score = match.distance;
            } else {
              // new user: show label, registration happens in background
              label = "registering...";
              score = 0;
              registerNewUser(descriptor); // Non-blocking call
            }

            // Draw box immediately
            drawBox(box, label, score);
            // Cache for smooth updates
            lastBoxes.push({ box, label, score });
          }

          // Update log if user count changed (check in background)
          if (users.length !== lastUserCount) {
            lastUserCount = users.length;
            log.innerText = `Camera active. Detecting faces... (${
              users.length
            } users: ${users.map((u) => u.id).join(", ")})`;
          }
        }
      } catch (e) {
        console.error("Detection error", e);
      } finally {
        processing = false;
      }
    };

    // Run detection without blocking
    runDetection()
      .then(() => {
        // Continue loop immediately after detection starts (doesn't wait for completion)
        requestAnimationFrame(detectLoop);
      })
      .catch(() => {
        processing = false;
        requestAnimationFrame(detectLoop);
      });

    // Also continue loop in parallel for smooth animation
    requestAnimationFrame(detectLoop);
  } catch (e) {
    console.error("Detection setup error", e);
    processing = false;
    requestAnimationFrame(detectLoop);
  }
}

window.addEventListener("load", init);
