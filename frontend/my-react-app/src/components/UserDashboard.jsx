import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const BASE_URL = "http://localhost:8000";

export default function UserDashboard() {
  const navigate = useNavigate();
  
  // Get employeeId from localStorage or URL param
  const [employeeId, setEmployeeId] = useState(() => {
    const param = new URLSearchParams(window.location.search).get("id");
    return param || localStorage.getItem("employeeId") || "";
  });
  
  const [employee, setEmployee] = useState(null);
  const [targets, setTargets] = useState([]);
  const [odometer, setOdometer] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Load employee info and targets on mount or employeeId change
  useEffect(() => {
    if (!employeeId) {
      setStatus("Please log in with your employee ID");
      return;
    }

    localStorage.setItem("employeeId", employeeId);

    const loadData = async () => {
      try {
        setLoading(true);
        console.log("Loading employee data for ID:", employeeId);
        
        const [empRes, targetsRes] = await Promise.all([
          axios.get(`${BASE_URL}/employee/${employeeId}/info`),
          axios.get(`${BASE_URL}/employee/${employeeId}/targets`),
        ]);

        console.log("Employee data loaded:", empRes.data);
        console.log("Targets loaded:", targetsRes.data);

        setEmployee(empRes.data);
        setTargets(targetsRes.data || []);
        setStatus("Ready to check in");
      } catch (e) {
        console.error("Error loading employee data:", e);
        setError(e.response?.data?.detail || e.message || "Failed to load data");
        setStatus("Invalid employee ID");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [employeeId]);

  const handleOdometerChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setOdometer(file);
      setStatus("Odometer image selected");
    }
  };

  const handleSelfieCapture = () => {
    setShowCamera(true);
    setError("");
    
    // Access camera
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        const video = document.getElementById("camera-preview");
        if (video) {
          video.srcObject = stream;
          video.play();
        }
      })
      .catch((err) => {
        setError("Camera access denied: " + err.message);
        setShowCamera(false);
      });
  };

  const captureSelfie = () => {
    const video = document.getElementById("camera-preview");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Stop camera
    const stream = video.srcObject;
    stream.getTracks().forEach(track => track.stop());

    // Convert to blob
    canvas.toBlob((blob) => {
      setSelfie(blob);
      setShowCamera(false);
      setStatus("Selfie captured successfully");
    }, "image/jpeg", 0.9);
  };

  const cancelCamera = () => {
    const video = document.getElementById("camera-preview");
    if (video && video.srcObject) {
      const stream = video.srcObject;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const handleCheckIn = async () => {
    if (!odometer) {
      setError("Please upload odometer image");
      return;
    }

    if (!selfie) {
      setError("Please capture selfie");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setStatus("Starting session...");

      // Get employee location for check-in
      if (!navigator.geolocation) {
        setError("Geolocation not supported");
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;

          try {
            // Create FormData for multipart upload
            const formData = new FormData();
            formData.append("data", JSON.stringify({ employee_id: parseInt(employeeId), lat, lng }));
            formData.append("selfie", selfie, "selfie.jpg");
            formData.append("odometer", odometer, "odometer.jpg");

            console.log("Sending check-in request...", { employee_id: employeeId, lat, lng });

            // Start session
            const res = await axios.post(`${BASE_URL}/session/start`, formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              }
            });

            console.log("Session start response:", res.data);

            if (res.data.session_id) {
              const sessionId = res.data.session_id;
              setStatus(`Session started: #${sessionId}`);
              localStorage.setItem("sessionId", sessionId);
              
              // Navigate to tracking
              setTimeout(() => {
                navigate(`/user/tracking/${sessionId}`);
              }, 1000);
            } else {
              setError("Failed to start session - no session ID returned");
              setLoading(false);
            }
          } catch (err) {
            console.error("Check-in error:", err);
            setError(err.response?.data?.detail || err.message || "Check-in failed");
            setLoading(false);
          }
        },
        (err) => {
          console.error("Geolocation error:", err);
          setError(`Location error: ${err.message}. Please ensure location permissions are enabled.`);
          setLoading(false);
        },
        { 
          enableHighAccuracy: false,  // Set to false for faster response
          timeout: 30000,              // Increase to 30 seconds
          maximumAge: 60000            // Allow cached position up to 1 minute old
        }
      );
    } catch (e) {
      console.error("Unexpected error:", e);
      setError(e.message || "Check-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="user-dashboard">
      <div className="container">
        {/* Employee Login (temporary, will be face recognition) */}
        {!employee && (
          <div className="login-section">
            <h2>Employee Login</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                placeholder="Enter your employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
              <button className="btn-primary" onClick={() => window.location.reload()}>
                Login
              </button>
            </div>
          </div>
        )}

        {/* Welcome Section */}
        {employee && (
          <>
            <div className="welcome-section">
              <h1>Welcome, {employee.name}! 👋</h1>
              <p className="subtitle">{employee.employee_code}</p>
            </div>

            {/* Today's Targets */}
            <div className="targets-section">
              <h2>Today's Targets</h2>
              {targets.length === 0 ? (
                <p className="muted">No targets assigned for today</p>
              ) : (
                <div className="target-list">
                  {targets.map((t) => (
                    <div key={t.assignment_id} className="target-card">
                      <h3>{t.geofence_name}</h3>
                      <p><strong>Radius:</strong> {(t.radius_m / 1000).toFixed(2)} km</p>
                      <p><strong>Location:</strong> [{t.center[0].toFixed(4)}, {t.center[1].toFixed(4)}]</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Check-In Section */}
            <div className="checkin-section">
              <h2>Check In</h2>
              
              {/* Selfie Capture */}
              <div className="form-group">
                <label>Capture Selfie</label>
                {!selfie && !showCamera && (
                  <button className="btn-secondary" onClick={handleSelfieCapture} disabled={loading}>
                    📸 Open Camera
                  </button>
                )}
                {selfie && <p className="success">✓ Selfie captured</p>}
              </div>

              {/* Camera Preview */}
              {showCamera && (
                <div className="camera-container">
                  <video id="camera-preview" autoPlay playsInline style={{ width: "100%", maxWidth: "400px", borderRadius: "8px" }}></video>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button className="btn-primary" onClick={captureSelfie}>Capture</button>
                    <button className="btn-secondary" onClick={cancelCamera}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Odometer Upload */}
              <div className="form-group">
                <label>Upload Odometer Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleOdometerChange}
                  disabled={loading}
                />
                {odometer && <p className="success">✓ {odometer.name}</p>}
              </div>

              <button
                className="btn-primary"
                onClick={handleCheckIn}
                disabled={loading || !odometer || !selfie}
                style={{ opacity: loading || !odometer || !selfie ? 0.6 : 1 }}
              >
                {loading ? "Checking in..." : "Start Tracking"}
              </button>

              {error && <div className="alert error">{error}</div>}
              {status && <div className="alert info">{status}</div>}
            </div>
          </>
        )}
      </div>

      <style>{`
        .user-dashboard {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 2rem;
        }

        .container {
          max-width: 600px;
          margin: 0 auto;
        }

        .login-section {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          margin-bottom: 2rem;
        }

        .login-section h2 {
          margin-bottom: 1rem;
          color: #333;
        }

        .welcome-section {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          text-align: center;
          margin-bottom: 2rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .welcome-section h1 {
          margin: 0;
          color: #333;
          font-size: 2rem;
        }

        .subtitle {
          color: #666;
          margin: 0.5rem 0 0 0;
        }

        .targets-section {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          margin-bottom: 2rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .targets-section h2 {
          margin-top: 0;
          color: #333;
        }

        .target-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .target-card {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .target-card h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .target-card p {
          margin: 0.3rem 0;
          color: #666;
          font-size: 0.9rem;
        }

        .checkin-section {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .checkin-section h2 {
          margin-top: 0;
          color: #333;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #333;
          font-weight: 500;
        }

        .form-group input[type="file"] {
          width: 100%;
          padding: 0.5rem;
          border: 2px dashed #667eea;
          border-radius: 6px;
          cursor: pointer;
        }

        .success {
          color: #10b981;
          font-size: 0.9rem;
          margin-top: 0.5rem;
        }

        .btn-primary {
          width: 100%;
          padding: 1rem;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s;
        }

        .btn-primary:hover:not(:disabled) {
          background: #5568d3;
        }

        .btn-primary:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .btn-secondary {
          width: 100%;
          padding: 1rem;
          background: white;
          color: #667eea;
          border: 2px solid #667eea;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #667eea;
          color: white;
        }

        .camera-container {
          margin: 1rem 0;
          text-align: center;
          padding: 1rem;
          background: #f3f4f6;
          border-radius: 8px;
        }

        .alert {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .alert.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .alert.info {
          background: #e0f2fe;
          color: #0c4a6e;
        }

        .muted {
          color: #6b7280;
        }

        input[type="number"] {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 6px;
          flex: 1;
        }
      `}</style>
    </div>
  );
}
