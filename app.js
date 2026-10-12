
const API_URL = "http://localhost:3000/api";

const moistureElement = document.getElementById("moisture");
const temperatureElement = document.getElementById("temperature");
const humidityElement = document.getElementById("humidity");
const pumpStatusElement = document.getElementById("pump-status");
const soilMessageElement = document.getElementById("soil-message");
const pumpMessageElement = document.getElementById("pump-message");
const messageElement = document.getElementById("message");
const moistureInput = document.getElementById("moisture-input");
const simulateButton = document.getElementById("simulate-button");
const activityList = document.getElementById("activity-list");

const canvas = document.getElementById("moisture-chart");
const ctx = canvas.getContext("2d");

let readings = [];
let lastPumpState = null;

function addActivity(text) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
  activityList.prepend(item);

  while (activityList.children.length > 8) {
    activityList.removeChild(activityList.lastElementChild);
  }
}

function drawChart() {
  const width = canvas.clientWidth || 600;
  const height = 220;
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = 42;
  const right = width - 12;
  const top = 18;
  const bottom = height - 24;

  ctx.font = "12px Arial";
  ctx.strokeStyle = "#e0e8e1";
  ctx.fillStyle = "#607568";
  ctx.lineWidth = 1;

  for (let value = 0; value <= 100; value += 25) {
    const y = bottom - (value / 100) * (bottom - top);

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    ctx.fillText(`${value}%`, 2, y + 4);
  }

  if (readings.length === 0) {
    ctx.fillStyle = "#607568";
    ctx.fillText("No readings yet", left + 10, height / 2);
    return;
  }

  const step = readings.length > 1
    ? (right - left) / (readings.length - 1)
    : 0;

  ctx.beginPath();
  ctx.strokeStyle = "#176b3a";
  ctx.lineWidth = 3;

  readings.forEach((reading, index) => {
    const x = left + index * step;
    const y = bottom - (reading / 100) * (bottom - top);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  readings.forEach((reading, index) => {
    const x = left + index * step;
    const y = bottom - (reading / 100) * (bottom - top);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#176b3a";
    ctx.fill();
  });
}

function updateDashboard(data) {
  const moisture = Number(data.soilMoisture);
  const pumpOn = Boolean(data.pumpOn);

  moistureElement.textContent = moisture;
  temperatureElement.textContent = data.temperature ?? "--";
  humidityElement.textContent = data.humidity ?? "--";

  soilMessageElement.textContent = moisture < 30
    ? "Soil is dry"
    : moisture >= 60
      ? "Moisture is sufficient"
      : "Soil moisture is moderate";

  soilMessageElement.style.color = moisture < 30
    ? "#b3261e"
    : "#176b3a";

  pumpStatusElement.textContent = pumpOn ? "ON" : "OFF";
  pumpStatusElement.className = pumpOn ? "status on" : "status off";

  pumpMessageElement.textContent = pumpOn
    ? "Pump ON (simulation only)"
    : "Pump OFF (simulation only)";

  if (Array.isArray(data.history)) {
    readings = data.history
      .map((item) => Number(item.soilMoisture))
      .filter((value) => Number.isFinite(value));
  }

  drawChart();
}

async function loadStatus() {
  try {
    const response = await fetch(`${API_URL}/status`);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    updateDashboard(data);
    messageElement.textContent =
      "Connected to backend. Readings are simulated.";
  } catch (error) {
    messageElement.textContent =
      "Backend not connected. Start the backend server to continue.";
  }
}

async function simulateReading() {
  const moisture = Number(moistureInput.value);

  if (
    moistureInput.value.trim() === "" ||
    !Number.isFinite(moisture) ||
    moisture < 0 ||
    moisture > 100
  ) {
    messageElement.textContent =
      "Enter a soil moisture value between 0 and 100.";
    return;
  }

  simulateButton.disabled = true;

  try {
    const response = await fetch(`${API_URL}/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ soilMoisture: moisture })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to submit reading.");
    }

    updateDashboard(data);

    if (lastPumpState !== data.pumpOn) {
      addActivity(
        `Simulated moisture ${moisture}%. Pump is ${
          data.pumpOn ? "ON" : "OFF"
        }.`
      );
    } else {
      addActivity(`Simulated moisture updated to ${moisture}%.`);
    }

    lastPumpState = data.pumpOn;
    messageElement.textContent =
      "Simulated reading submitted successfully.";
  } catch (error) {
    messageElement.textContent =
      `Could not submit reading: ${error.message}`;
  } finally {
    simulateButton.disabled = false;
  }
}

simulateButton.addEventListener("click", simulateReading);

window.addEventListener("resize", drawChart);

loadStatus();
