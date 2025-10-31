# 🎭 Face Recognition & Age Category Detection Demo

A real-time, browser-based face recognition system with age and gender estimation, powered by **face-api.js** and **Express.js**. This application detects faces from a webcam feed, recognizes known users, estimates age and gender, and categorizes crowds by age groups in real-time.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Age Categories](#age-categories)
- [API Endpoints](#api-endpoints)
- [File Structure](#file-structure)
- [Technologies Used](#technologies-used)
- [How Face Recognition Works](#how-face-recognition-works)
- [Performance Optimizations](#performance-optimizations)

## 🎯 Overview

This application provides a complete face recognition pipeline that:

1. **Detects faces** from live webcam feed using SSD MobileNet V1
2. **Recognizes users** by comparing 128-dimensional face descriptors with stored user profiles
3. **Estimates age and gender** using pre-trained neural networks
4. **Categorizes age groups** into 5 predefined categories
5. **Monitors crowd composition** in real-time and determines the dominant age category (80%+ threshold)
6. **Displays results** with visual overlays and a separate monitoring dashboard

All processing happens **client-side** in the browser, with the server only handling user data storage and model file serving.

## ✨ Features

### Core Functionality

- **Real-time Face Detection**: Continuously detects multiple faces in the camera feed at 200ms intervals
- **Face Recognition**: Matches detected faces against a database of known users using Euclidean distance
- **Auto User Registration**: Automatically assigns new IDs (`user1`, `user2`, etc.) to unrecognized faces
- **Age & Gender Estimation**: Estimates age (in years) and gender (Male/Female) for each detected face
- **Age Category Classification**: Automatically categorizes ages into predefined groups:
  - **Kids** (5-10 years)
  - **Teen** (11-15 years)
  - **Young Adults** (16-22 years)
  - **Adults** (23-35 years)
  - **Senior Adults** (36-50 years)

### Advanced Features

- **Crowd Analysis**: Calculates dominant age category when 80%+ of detected faces belong to one category
- **Real-time Category Monitoring**: Separate page that displays the current dominant category with live updates
- **Smooth Performance**: Optimized detection loop with caching and requestAnimationFrame for smooth 60fps rendering
- **Multiple Face Support**: Handles multiple faces simultaneously with individual tracking
- **Persistent User Storage**: User descriptors are saved to `users.json` and persist across sessions

## 🔧 How It Works

### Detection Pipeline

1. **Video Capture**: Browser accesses webcam stream via `getUserMedia()` API
2. **Face Detection**: Uses SSD MobileNet V1 to detect bounding boxes around faces
3. **Landmark Detection**: Identifies 68 facial landmarks for face alignment
4. **Face Recognition**: Computes 128-dimensional descriptor vectors for each face
5. **Age/Gender Estimation**: Runs age and gender classification networks
6. **User Matching**: Compares descriptors against stored user database using Euclidean distance
7. **Category Analysis**: Categorizes detected ages and calculates crowd composition
8. **Visualization**: Draws bounding boxes, labels, and overlays on canvas

### Recognition Algorithm

The system uses **face descriptor comparison**:

- Each face is converted to a 128-dimensional vector (face descriptor)
- Descriptors are compared using **Euclidean distance**
- If distance < 0.55 (threshold), the face is recognized as a known user
- If distance ≥ 0.55, the face is treated as a new user and registered

### Age Category Calculation

1. Each detected face is categorized based on estimated age
2. Categories are tracked over a 2-second rolling window
3. The system calculates which category represents 80%+ of recent detections
4. When threshold is met, that category becomes the "dominant category"
5. Category is broadcast to the monitoring page via localStorage API

## 🏗️ Architecture

### Client-Side (Browser)

- **index.html**: Main interface with camera feed
- **script.js**: Core detection, recognition, and category logic
- **category.html**: Real-time category monitoring dashboard
- **face-api.js** (CDN): Pre-trained models for face detection, landmarks, recognition, age, and gender

### Server-Side (Node.js/Express)

- **server.js**:
  - Serves static files (HTML, CSS, JS)
  - Downloads and serves ML model files
  - Provides REST API for user management
  - Stores user descriptors in `users.json`

### Data Flow

```
Webcam → face-api.js → Face Detection → Face Recognition → User Matching
                                                        ↓
                                        Age/Gender Estimation → Category Calculation
                                                        ↓
                                        Visual Overlay ← Category Broadcast → Monitoring Page
```

## 🚀 Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- Modern browser with WebRTC support (Chrome, Firefox, Edge)
- Webcam access

### Installation Steps

1. **Clone or download the repository**

2. **Install dependencies**:

```bash
npm install
```

This installs:

- `express`: Web server framework
- `body-parser`: Request body parsing middleware
- `node-fetch`: HTTP client for downloading models

3. **Start the server**:

```bash
npm start
```

The server will:

- Check for required ML model files
- Automatically download missing models from GitHub (first run only)
- Start listening on `http://localhost:3001` (or port 3001 if 3000 is busy)

4. **Access the application**:
   - Main page: `http://localhost:3001`
   - Category monitor: `http://localhost:3001/category.html`

## 📖 Usage

### Initial Setup

1. Open `http://localhost:3001` in your browser
2. Allow camera access when prompted
3. Wait for models to load (first time only, ~10-20 seconds)
4. Models will be cached in `public/models/` for future use

### Using Face Recognition

1. **Face the camera**: The system will automatically detect your face
2. **First detection**: Unknown faces are automatically registered as new users
3. **Recognition**: Once registered, faces are recognized and labeled with their user ID
4. **Labels display**: Each face shows:
   - User ID (e.g., `user1`)
   - Recognition confidence score
   - Age, gender, and category

### Using Category Monitor

1. Click "📊 Open Category Monitor" button or navigate to `/category.html`
2. Open in a separate window/tab for best experience
3. Monitor updates in real-time showing:
   - Current dominant age category (if 80%+ threshold met)
   - Status messages
   - Last update timestamp

### User Management

- **Automatic Registration**: New faces are automatically assigned sequential IDs
- **Persistent Storage**: User data is saved in `public/users.json`
- **Multiple Descriptors**: Each user can have multiple face descriptors for better recognition accuracy

## 📊 Age Categories

The system categorizes detected ages into the following groups:

| Category          | Age Range   | Description                     |
| ----------------- | ----------- | ------------------------------- |
| **Kids**          | 5-10 years  | Children in primary school age  |
| **Teen**          | 11-15 years | Teenagers in middle/high school |
| **Young Adults**  | 16-22 years | Young adults, college students  |
| **Adults**        | 23-35 years | Working-age adults              |
| **Senior Adults** | 36-50 years | Experienced professionals       |

**Note**: Ages outside the 5-50 range are not categorized but are still detected and displayed.

## 🌐 API Endpoints

### `GET /users.json`

Returns the list of all registered users with their descriptors.

**Response**:

```json
[
  {
    "id": "user1",
    "descriptors": [[128 numbers], [128 numbers], ...]
  }
]
```

### `POST /register_new`

Registers a new user and returns a new unique ID.

**Response**:

```json
{
  "id": "user2"
}
```

### `POST /save`

Saves a face descriptor for a user.

**Request Body**:

```json
{
  "id": "user1",
  "descriptor": [128 numbers]
}
```

**Response**:

```json
{
  "ok": true,
  "usersCount": 2
}
```

## 📁 File Structure

```
face_recognition_demo/
├── server.js                 # Express server + model downloader
├── package.json              # Dependencies and scripts
├── package-lock.json         # Locked dependency versions
├── README.md                 # This file
└── public/
    ├── index.html            # Main application page
    ├── category.html         # Category monitoring page
    ├── script.js             # Client-side detection logic
    ├── styles.css            # Application styling
    ├── users.json            # User database (auto-generated)
    └── models/               # ML model files (auto-downloaded)
        ├── ssd_mobilenetv1_model-weights_manifest.json
        ├── ssd_mobilenetv1_model-shard1
        ├── ssd_mobilenetv1_model-shard2
        ├── face_landmark_68_model-weights_manifest.json
        ├── face_landmark_68_model-shard1
        ├── face_recognition_model-weights_manifest.json
        ├── face_recognition_model-shard1
        ├── face_recognition_model-shard2
        ├── age_gender_model-weights_manifest.json
        └── age_gender_model-shard1
```

## 🛠️ Technologies Used

### Frontend

- **face-api.js** (v0.22.2): TensorFlow.js-based face recognition library
  - SSD MobileNet V1: Face detection
  - Face Landmark 68: Facial feature detection
  - Face Recognition Network: 128-d descriptor generation
  - Age & Gender Net: Age and gender estimation
- **Vanilla JavaScript**: No framework dependencies
- **HTML5 Canvas**: Real-time visual overlays
- **WebRTC/MediaDevices API**: Camera access

### Backend

- **Node.js**: JavaScript runtime
- **Express.js**: Web server framework
- **body-parser**: Request parsing middleware
- **node-fetch**: HTTP client for model downloads

### Data Storage

- **JSON file** (`users.json`): Simple file-based storage for user descriptors
- **localStorage API**: Real-time category broadcasting between pages

## 🔬 How Face Recognition Works

### Face Descriptors

A **face descriptor** is a 128-dimensional vector that uniquely represents a face. Similar faces have similar descriptors (low Euclidean distance), while different faces have different descriptors (high distance).

**Example**:

- Same person seen at different angles → Distance: ~0.3-0.5
- Different people → Distance: ~0.7-1.2
- Recognition threshold: 0.55 (configurable in `script.js`)

### Recognition Process

1. **Face Detection**: Finds faces in image using bounding boxes
2. **Alignment**: Uses 68 landmarks to normalize face orientation
3. **Embedding**: Converts normalized face to 128-d vector
4. **Comparison**: Computes Euclidean distance to all stored descriptors
5. **Decision**: If minimum distance < threshold → Recognized; else → New user

### Multi-Descriptor Matching

Each user can store multiple descriptors (different angles, expressions). The system compares against **all** stored descriptors and uses the minimum distance, improving recognition accuracy across varying conditions.

## ⚡ Performance Optimizations

### Detection Loop

- **Throttled Detection**: Runs every 200ms (5 fps) instead of every frame
- **RequestAnimationFrame**: Smooth 60fps rendering loop
- **Box Caching**: Maintains visual feedback between detections
- **Non-blocking**: Detection runs asynchronously without blocking UI

### Memory Management

- **Rolling Window**: Only tracks detections from last 2 seconds
- **Descriptor Limiting**: Each user can accumulate multiple descriptors over time
- **Garbage Collection**: Old detections are automatically filtered out

### Network Optimization

- **Model Caching**: Models downloaded once and cached locally
- **CDN Loading**: face-api.js loaded from CDN for faster delivery
- **Efficient Updates**: Only broadcasts category when it changes

## 🎨 UI Features

- **Modern Gradient Background**: Purple-blue gradient design
- **Responsive Layout**: Works on desktop and mobile devices
- **Smooth Animations**: Category changes animate smoothly
- **Visual Feedback**: Real-time status messages and indicators
- **Mirror Mode**: Camera feed is horizontally flipped for natural interaction

## 🔍 Technical Details

### Model Files

The application uses 4 pre-trained TensorFlow.js models:

1. **SSD MobileNet V1** (~6MB): Fast face detection
2. **Face Landmark 68** (~350KB): Facial feature detection
3. **Face Recognition** (~6.5MB): Descriptor generation
4. **Age & Gender** (~4MB): Age and gender classification

Total model size: ~17MB (downloaded once)

### Coordinate System

- Video is flipped horizontally (`scaleX(-1)`) for mirror effect
- Canvas overlay coordinates are adjusted to match flipped video
- Face detection coordinates are converted from video space to display space

### Thresholds & Parameters

- **Recognition Threshold**: 0.55 (Euclidean distance)
- **Category Threshold**: 80% (dominant category calculation)
- **Detection Interval**: 200ms (5 detections per second)
- **Rolling Window**: 2000ms (2 seconds for category calculation)

## 🐛 Troubleshooting

### Camera Not Loading

- Check browser permissions for camera access
- Ensure HTTPS (required for camera access in some browsers)
- Try a different browser (Chrome recommended)

### Models Not Loading

- Check internet connection (required for first-time model download)
- Verify `public/models/` directory exists and is writable
- Check browser console for 404 errors

### Poor Recognition Accuracy

- Ensure good lighting
- Face the camera directly
- Wait for multiple descriptors to be saved (improves accuracy)
- Adjust `THRESHOLD` in `script.js` (lower = stricter)

### Category Not Updating

- Ensure multiple faces are detected
- Check that ages are within 5-50 range
- Verify both pages are open in same browser (localStorage requirement)

## 📝 License

This project is open source and available for educational and commercial use.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## 📧 Contact

For questions or issues, please open an issue on the GitHub repository.

---

**Built with ❤️ using face-api.js and Express.js**
