// Client-side script: loads face-api models from /models, opens webcam, detects faces and descriptors,
// matches to stored users, and calls server to register new users and save descriptors.

const video = document.getElementById("inputVideo");
const canvas = document.getElementById("overlay");
const log = document.getElementById("log");
let users = []; // loaded from server: [{id, descriptors: [[...], ...]}, ...]
const THRESHOLD = 0.55; // distance threshold for recognition (lower = stricter)

// Age category definitions
function getAgeCategory(age) {
  if (age >= 5 && age <= 10) return { category: "Kids", ageGroup: "5-10" };
  if (age >= 11 && age <= 15) return { category: "Teen", ageGroup: "11-15" };
  if (age >= 16 && age <= 22)
    return { category: "Young Adults", ageGroup: "16-22" };
  if (age >= 23 && age <= 35) return { category: "Adults", ageGroup: "23-35" };
  if (age >= 36 && age <= 50)
    return { category: "Senior Adults", ageGroup: "36-50" };
  return null; // Outside defined ranges
}

// Track current detected users and their categories
let currentDetections = []; // {age, category, timestamp}

// Calculate dominant category (80%+ threshold)
function calculateDominantCategory(detections) {
  if (!detections || detections.length === 0) return null;

  // Remove old detections (older than 2 seconds)
  const now = Date.now();
  const recentDetections = detections.filter((d) => now - d.timestamp < 2000);

  if (recentDetections.length === 0) return null;

  // Count by category
  const categoryCounts = {};
  recentDetections.forEach((d) => {
    if (d.category) {
      if (!categoryCounts[d.category]) {
        categoryCounts[d.category] = {
          count: 0,
          genders: { male: 0, female: 0 },
        };
      }
      categoryCounts[d.category].count++;
      if (
        d.gender &&
        (d.gender.toLowerCase() === "male" ||
          d.gender.toLowerCase() === "female")
      ) {
        categoryCounts[d.category].genders[d.gender.toLowerCase()]++;
      }
    }
  });

  // Find category with majority (50%+) representation
  const total = recentDetections.length;
  for (const [category, data] of Object.entries(categoryCounts)) {
    const percentage = (data.count / total) * 100;
    if (percentage >= 50) {
      // Calculate dominant gender for this category
      const genderCount = data.genders.male + data.genders.female;
      let dominantGender = null;
      if (genderCount > 0) {
        dominantGender =
          data.genders.male > data.genders.female
            ? "male"
            : data.genders.female > data.genders.male
            ? "female"
            : null;
      }
      return { category, gender: dominantGender };
    }
  }

  return null; // No category reaches 50% threshold
}

// Broadcast category to parallel page via localStorage
function broadcastCategory(result) {
  const data = {
    category: result ? result.category : null,
    gender: result ? result.gender : null,
    timestamp: Date.now(),
  };
  localStorage.setItem("dominantAgeCategory", JSON.stringify(data));
  // Also dispatch custom event for same-tab listeners
  window.dispatchEvent(new CustomEvent("categoryUpdate", { detail: data }));
}

async function init() {
  try {
    log.innerText = "Loading face recognition models...";
    await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    await faceapi.nets.ageGenderNet.loadFromUri("/models");
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
      log.innerText = "System ready. Face the camera to begin detection.";
    } else {
      log.innerText = "Ready. Face the camera to register.";
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
      log.innerText = "Camera active. Detecting faces...";
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

function drawBox(
  box,
  label,
  score,
  age,
  gender,
  genderProbability,
  ageCategory = null
) {
  const ctx = canvas.getContext("2d");

  // Calculate flipped x coordinate to match the flipped video
  // Video is flipped with CSS scaleX(-1), so we need to mirror x coordinates
  const flippedX = canvas.width - box.x - box.width;

  // Draw bounding box with modern styling
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#4ade80";
  ctx.shadowColor = "rgba(74, 222, 128, 0.5)";
  ctx.shadowBlur = 10;
  ctx.strokeRect(flippedX, box.y, box.width, box.height);
  ctx.shadowBlur = 0;

  // Build label text - first line: user ID or status
  let labelText = label;
  if (score !== undefined && score > 0) {
    labelText += ` (${score.toFixed(2)})`;
  }

  // Build age/gender/category text - second line
  let ageGenderText = "";
  if (age !== undefined && gender !== undefined) {
    const ageNum = Math.round(age);
    if (ageCategory) {
      ageGenderText = `${ageNum}y ${gender} • ${ageCategory.category}`;
    } else {
      ageGenderText = `${ageNum} years, ${gender}`;
    }
  }

  // Calculate text dimensions
  ctx.font = "bold 14px Arial";
  const labelMetrics = ctx.measureText(labelText);
  let maxWidth = labelMetrics.width;

  if (ageGenderText) {
    ctx.font = "12px Arial";
    const ageGenderMetrics = ctx.measureText(ageGenderText);
    maxWidth = Math.max(maxWidth, ageGenderMetrics.width);
  }

  const textWidth = maxWidth;
  const textHeight = ageGenderText ? 40 : 20; // More height if showing age/gender

  // Draw label background with rounded corners
  ctx.fillStyle = "rgba(74, 222, 128, 0.95)";
  const x = flippedX;
  const y = box.y - textHeight - 2;
  const w = textWidth + 16;
  const h = textHeight;
  const r = 8;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Draw label text (user ID/status)
  ctx.fillStyle = "#fff";
  ctx.font =
    "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(labelText, flippedX + 8, box.y - textHeight + 18);

  // Draw age/gender on second line if available
  if (ageGenderText) {
    ctx.font =
      "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(ageGenderText, flippedX + 8, box.y - textHeight + 34);
  }
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
        drawBox(
          cached.box,
          cached.label,
          cached.score,
          cached.age,
          cached.gender,
          cached.genderProbability,
          cached.ageCategory
        );
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
        drawBox(
          cached.box,
          cached.label,
          cached.score,
          cached.age,
          cached.gender,
          cached.genderProbability,
          cached.ageCategory
        );
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
        // Detect faces with landmarks, descriptors, age and gender
        const detections = await faceapi
          .detectAllFaces(video)
          .withFaceLandmarks()
          .withFaceDescriptors()
          .withAgeAndGender();

        // Resize detections to match canvas dimensions
        const resizedDetections = faceapi.resizeResults(detections || [], {
          width: canvas.width,
          height: canvas.height,
        });

        clearCanvas();
        lastBoxes = []; // Clear cached boxes

        if (resizedDetections && resizedDetections.length > 0) {
          // Update current detections with age categories
          currentDetections = [];

          for (const det of resizedDetections) {
            const box = det.detection.box;
            const descriptor = Array.from(det.descriptor);
            const match = findBestMatch(descriptor);

            // Extract age and gender information
            const age = det.age;
            const gender = det.gender;
            const genderProbability = det.genderProbability;

            // Get age category
            const ageCategory = getAgeCategory(Math.round(age));

            // Track detection with category and gender
            if (ageCategory) {
              currentDetections.push({
                age: Math.round(age),
                category: ageCategory.category,
                ageGroup: ageCategory.ageGroup,
                gender: gender, // Include gender for category-specific ads
                timestamp: Date.now(),
              });
            }

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

            // Draw box with age, gender, and category info
            drawBox(
              box,
              label,
              score,
              age,
              gender,
              genderProbability,
              ageCategory
            );
            // Cache for smooth updates
            lastBoxes.push({
              box,
              label,
              score,
              age,
              gender,
              genderProbability,
              ageCategory,
            });
          }

          // Calculate and broadcast dominant category
          const dominantCategory = calculateDominantCategory(currentDetections);
          broadcastCategory(dominantCategory);

          // Update log if user count changed (check in background)
          if (users.length !== lastUserCount) {
            lastUserCount = users.length;
            log.innerText = "Camera active. Detecting faces...";
          }
        } else {
          // No detections - clear category
          currentDetections = [];
          broadcastCategory(null);
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
