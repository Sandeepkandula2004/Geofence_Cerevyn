import axios from "axios";
import FormData from "form-data";

const BASE_URL = "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL });

/**
 * Utility sleep
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * STEP 0 — Create Test Geofences
 */
async function createTestGeofences() {
  console.log("📍 Creating test geofences...");
  
  const geofences = [
    { name: "Geofence North", center_lat: 17.458, center_lng: 78.3974, radius_m: 150 },
    { name: "Geofence East", center_lat: 17.452, center_lng: 78.4040, radius_m: 150 },
    { name: "Geofence South", center_lat: 17.446, center_lng: 78.3974, radius_m: 150 },
    { name: "Geofence West", center_lat: 17.452, center_lng: 78.3910, radius_m: 150 },
  ];

  const createdIds = [];
  for (const gf of geofences) {
    try {
      const res = await api.post("/geofence/create", gf);
      console.log(`✅ Created: ${gf.name} at (${gf.center_lat}, ${gf.center_lng})`);
      createdIds.push(res.data.geofence_id);
    } catch (err) {
      console.log(`⚠️ ${gf.name} may already exist`);
    }
  }
  
  return createdIds;
}

/**
 * STEP 1 — Create Employee
 */
async function createEmployee() {
  const uniqueCode = `EMP-PIPELINE-${Date.now()}`;
  const res = await api.post("/employee/create", {
    name: `Test Employee ${uniqueCode}`,
    employee_code: uniqueCode,
  });
  console.log("✅ Employee created:", res.data);
  return res.data.employee_id;
}

/**
 * STEP 2 — Start Session (Check-in)
 */
async function startSession(employeeId) {
  // Backend expects multipart/form-data with JSON string in "data" and two files
  const form = new FormData();
  form.append(
    "data",
    JSON.stringify({ employee_id: employeeId, lat: 17.452237, lng: 78.39744 })
  );
  form.append("selfie", Buffer.from("fake-selfie"), { filename: "selfie.txt" });
  form.append("odometer", Buffer.from("fake-odo"), { filename: "odometer.txt" });

  const res = await api.post("/session/start", form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });
  console.log("✅ Session started:", res.data);
  return res.data.session_id;
}

/**
 * STEP 3 — GPS PATH (10-SECOND INTERVALS)
 * 
 * This simulation sends location updates every 10 seconds.
 * 
 * Backend behavior (as per app.py):
 * - Every 10 seconds: Checks if user is inside any geofence
 * - Every 60 seconds: Logs location to database for polyline drawing
 * - When geofence is detected: Updates geofence_status table
 * 
 * This path covers all 4 geofences with clear entry/exit points.
 */
const gpsPath = [
  { lat: 17.452, lng: 78.3974, description: "START" },
  
  // North route - 6 steps to Geofence North
  { lat: 17.453, lng: 78.3974, description: "→ North 1" },
  { lat: 17.454, lng: 78.3974, description: "→ North 2" },
  { lat: 17.455, lng: 78.3974, description: "→ North 3" },
  { lat: 17.456, lng: 78.3974, description: "→ North 4" },
  { lat: 17.457, lng: 78.3974, description: "→ North 5" },
  { lat: 17.458, lng: 78.3974, description: "✓ GEOFENCE NORTH" },
  { lat: 17.457, lng: 78.3974, description: "← Return 1" },
  { lat: 17.455, lng: 78.3974, description: "← Return 2" },
  { lat: 17.453, lng: 78.3974, description: "← Return 3" },
  { lat: 17.452, lng: 78.3974, description: "Back Center" },
  
  // East route - 7 steps to Geofence East
  { lat: 17.452, lng: 78.3984, description: "→ East 1" },
  { lat: 17.452, lng: 78.3994, description: "→ East 2" },
  { lat: 17.452, lng: 78.4004, description: "→ East 3" },
  { lat: 17.452, lng: 78.4014, description: "→ East 4" },
  { lat: 17.452, lng: 78.4024, description: "→ East 5" },
  { lat: 17.452, lng: 78.4034, description: "→ East 6" },
  { lat: 17.452, lng: 78.4040, description: "✓ GEOFENCE EAST" },
  { lat: 17.452, lng: 78.4024, description: "← Return 1" },
  { lat: 17.452, lng: 78.4004, description: "← Return 2" },
  { lat: 17.452, lng: 78.3974, description: "Back Center" },
  
  // South route - 6 steps to Geofence South
  { lat: 17.451, lng: 78.3974, description: "→ South 1" },
  { lat: 17.450, lng: 78.3974, description: "→ South 2" },
  { lat: 17.449, lng: 78.3974, description: "→ South 3" },
  { lat: 17.448, lng: 78.3974, description: "→ South 4" },
  { lat: 17.447, lng: 78.3974, description: "→ South 5" },
  { lat: 17.446, lng: 78.3974, description: "✓ GEOFENCE SOUTH" },
  { lat: 17.448, lng: 78.3974, description: "← Return 1" },
  { lat: 17.450, lng: 78.3974, description: "← Return 2" },
  { lat: 17.452, lng: 78.3974, description: "Back Center" },
  
  // West route - 7 steps to Geofence West
  { lat: 17.452, lng: 78.3964, description: "→ West 1" },
  { lat: 17.452, lng: 78.3954, description: "→ West 2" },
  { lat: 17.452, lng: 78.3944, description: "→ West 3" },
  { lat: 17.452, lng: 78.3934, description: "→ West 4" },
  { lat: 17.452, lng: 78.3924, description: "→ West 5" },
  { lat: 17.452, lng: 78.3914, description: "→ West 6" },
  { lat: 17.452, lng: 78.3910, description: "✓ GEOFENCE WEST" },
  { lat: 17.452, lng: 78.3934, description: "← Return 1" },
  { lat: 17.452, lng: 78.3964, description: "← Return 2" },
  { lat: 17.452, lng: 78.3974, description: "FINAL - Back to START" },
];

/**
 * STEP 4 — Send GPS every 10 seconds
 * 
 * Backend automatically handles:
 * - Geofence detection on every update (10 sec)
 * - Polyline logging every 60 seconds
 * - Geofence status updates when completed
 */
async function simulateTravel(sessionId, employeeId) {
  console.log("🚗 Starting travel simulation (10-second tracking)...");
  console.log(`📊 Total waypoints: ${gpsPath.length}`);
  console.log(`⏱️  Estimated time: ~${Math.round((gpsPath.length * 10) / 60)} minutes`);
  console.log(`\n🔄 Backend will:`);
  console.log(`   - Check geofences every 10 seconds (on every update)`);
  console.log(`   - Log polyline points every 60 seconds`);
  console.log(`   - Update geofence status when completed\n`);

  for (let i = 0; i < gpsPath.length; i++) {
    const p = gpsPath[i];

    await api.post("/tracking/update-location", {
      session_id: sessionId,
      employee_id: employeeId,
      lat: p.lat,
      lng: p.lng,
    });

    console.log(
      `📍 [${i + 1}/${gpsPath.length}] ${p.description} → (${p.lat}, ${p.lng})`
    );

    // Wait 10 seconds (skip on last point)
    if (i < gpsPath.length - 1) {
      await sleep(10_000);
    }
  }

  console.log("\n🏁 Travel simulation complete");
}

/**
 * STEP 5 — Checkout Session
 */
async function checkoutSession(sessionId) {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("odometer", Buffer.from("fake-odo-end"), { filename: "odometer_end.txt" });

  const res = await api.post("/session/checkout", form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });

  console.log("✅ Session checked out:", res.data);
}

/**
 * MAIN PIPELINE
 */
async function runPipeline() {
  try {
    console.log("\n🚀 GEOFENCE TESTING PIPELINE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Step 0: Create geofences
    await createTestGeofences();
    console.log();
    
    // Step 1: Create employee
    const employeeId = await createEmployee();
    console.log();
    
    // Step 2: Start session
    const sessionId = await startSession(employeeId);
    console.log();
    
    // Step 3: Simulate travel (10-second updates)
    await simulateTravel(sessionId, employeeId);
    console.log();

    // Step 4: Checkout
    console.log("⏳ Waiting 5 seconds before checkout...");
    await sleep(5000);
    await checkoutSession(sessionId);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 FULL PIPELINE TEST COMPLETED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`📊 Session ID: ${sessionId}`);
    console.log(`👤 Employee ID: ${employeeId}`);
    console.log(`\n💡 Check the admin dashboard to view:`);
    console.log(`   - Session polyline (logged every 60 seconds)`);
    console.log(`   - Geofence completions (all 4 should be marked complete)`);
    console.log(`   - Daily summary with odometer readings`);
  } catch (err) {
    console.error("\n❌ Pipeline failed:", err.response?.data || err.message);
    if (err.response?.data?.detail) {
      console.error("Details:", err.response.data.detail);
    }
  }
}

console.log("╔════════════════════════════════════════════╗");
console.log("║   GEOFENCE TRAVEL SIMULATOR                ║");
console.log("║   • 10-second tracking for geofence checks ║");
console.log("║   • 60-second polyline logging (backend)   ║");
console.log("╚════════════════════════════════════════════╝");

runPipeline();
