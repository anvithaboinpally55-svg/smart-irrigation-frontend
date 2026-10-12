
const API_URL = "http://localhost:3000/api";

const $ = (id) => document.getElementById(id);

let historyData = [];
let currentPeriod = "day";
let currentPumpState = false;
let lastReading = null;

const periodLabels = {
  day: "Today's average",
  week: "This week's average",
  month: "This month's average",
  year: "This year's average"
};

function setMessage(message, isError = false) {
  const el = $("message");
  el.textContent = message;
  el.style.color = isError ? "#b42318" : "#176b3a";
}

function addActivity(message) {
  const list = $("activity-list");
  const empty = list.querySelector(".empty-activity");
  if (empty) empty.remove();

  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  list.prepend(item);

  while (list.children.length > 20) {
    list.lastElementChild.remove();
  }
}

function normalizeHistory(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    if (typeof item === "number") {
      return { soilMoisture: item, timestamp: null };
    }

    return {
      soilMoisture: Number(item.soilMoisture),
      timestamp: item.timestamp || null
    };
  }).filter((item) =>
    Number.isFinite(item.soilMoisture) &&
    item.soilMoisture >= 0 &&
    item.soilMoisture <= 100
  );
}

function renderStatus(data) {
  $("moisture").textContent = data.soilMoisture ?? "--";
  $("temperature").textContent = data.temperature ?? "--";
  $("humidity").textContent = data.humidity ?? "--";

  const moisture = Number(data.soilMoisture);
  $("moisture-progress").style.width =
    Number.isFinite(moisture) ? `${Math.max(0, Math.min(100, moisture))}%` : "0%";

  if (moisture < 30) {
    $("soil-message").textContent = "Soil is dry — irrigation needed";
  } else if (moisture >= 60) {
    $("soil-message").textContent = "Soil moisture is sufficient";
  } else {
    $("soil-message").textContent = "Soil moisture is in the middle range";
  }

  currentPumpState = Boolean(data.pumpOn);
  $("pump-status").textContent = currentPumpState ? "ON" : "OFF";
  $("pump-indicator").classList.toggle("off", !currentPumpState);
  $("pump-message").textContent = currentPumpState
    ? "Pump activated by irrigation rule"
    : "Pump is currently inactive";

  $("last-updated").textContent =
    `Last updated: ${new Date().toLocaleTimeString()}`;

  historyData = normalizeHistory(data.history);
  renderChart();
}

async function getStatus() {
  try {
    const response = await fetch(`${API_URL}/status`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);

    const data = await response.json();
    renderStatus(data);
    return true;
  } catch (error) {
    $("last-updated").textContent = "Backend connection unavailable";
    $("chart-message").textContent =
      "Start the backend on port 3000, then refresh this page.";
    setMessage("Cannot connect to the backend. Check that it is running.", true);
    return false;
  }
}

function getPeriodStart(period, now = new Date()) {
  const start = new Date(now);

  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
  } else if (period === "month") {
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
  } else {
    start.setHours(0, 0, 0, 0);
    start.setMonth(0, 1);
  }

  return start;
}

function getFilteredReadings() {
  const now = new Date();
  const start = getPeriodStart(currentPeriod, now);

  return historyData.filter((item) => {
    if (!item.timestamp) {
      // Legacy readings without timestamps cannot be assigned to a period.
      return false;
    }

    const date = new Date(item.timestamp);
    return !Number.isNaN(date.getTime()) && date >= start && date <= now;
  });
}

function buildChartPoints(readings) {
  const now = new Date();
  let count;
  let labels = [];

  if (currentPeriod === "day") {
    count = 24;
    labels = Array.from({ length: count }, (_, i) =>
      i % 4 === 0 ? `${String(i).padStart(2, "0")}:00` : ""
    );
  } else if (currentPeriod === "week") {
    count = 7;
    labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  } else if (currentPeriod === "month") {
    count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    labels = Array.from({ length: count }, (_, i) =>
      (i + 1 === 1 || (i + 1) % 5 === 0 || i + 1 === count)
        ? String(i + 1) : ""
    );
  } else {
    count = 12;
    labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  }

  const buckets = Array.from({ length: count }, () => []);

  readings.forEach((item) => {
    const date = new Date(item.timestamp);
    let index;

    if (currentPeriod === "day") {
      index = date.getHours();
    } else if (currentPeriod === "week") {
      index = date.getDay();
    } else if (currentPeriod === "month") {
      index = date.getDate() - 1;
    } else {
      index = date.getMonth();
    }

    if (index >= 0 && index < count) buckets[index].push(item.soilMoisture);
  });

  return {
    labels,
    values: buckets.map((bucket) =>
      bucket.length
        ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length
        : null
    )
  };
}

function drawChart(labels, values) {
  const canvas = $("moisture-chart");
  const container = canvas.parentElement;
  const width = Math.max(280, container.clientWidth);
  const height = window.innerWidth <= 600 ? 230 : 260;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 15, right: 12, bottom: 35, left: 38 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  ctx.font = "11px Segoe UI, Arial";
  ctx.lineWidth = 1;

  [0, 25, 50, 75, 100].forEach((value) => {
    const y = pad.top + chartHeight * (1 - value / 100);
    ctx.strokeStyle = "#e8eee9";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = "#718078";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), pad.left - 8, y);
  });

  const xAt = (i) => pad.left +
    (labels.length <= 1 ? chartWidth / 2 : i * chartWidth / (labels.length - 1));
  const yAt = (value) => pad.top + chartHeight * (1 - value / 100);

  ctx.fillStyle = "#718078";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  labels.forEach((label, i) => {
    if (label) ctx.fillText(label, xAt(i), height - pad.bottom + 12);
  });

  let previous = null;
  ctx.strokeStyle = "#21834a";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  values.forEach((value, i) => {
    if (value === null) {
      previous = null;
      return;
    }

    const point = { x: xAt(i), y: yAt(value) };

    if (previous) {
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    ctx.fillStyle = "#21834a";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    previous = point;
  });

  if (!values.some((value) => value !== null)) {
    ctx.fillStyle = "#718078";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No readings for this period yet", width / 2, height / 2);
  }
}

function renderChart() {
  $("average-label").textContent = periodLabels[currentPeriod];

  const readings = getFilteredReadings();
  const count = readings.length;

  $("reading-count").textContent =
    `${count} ${count === 1 ? "reading" : "readings"}`;

  if (count) {
    const average = readings.reduce(
      (sum, item) => sum + item.soilMoisture, 0
    ) / count;
    $("average-moisture").textContent = `${average.toFixed(1)}%`;
    $("chart-message").textContent =
      `Showing ${currentPeriod} data using ${count} timestamped readings.`;
  } else {
    $("average-moisture").textContent = "--%";
    $("chart-message").textContent =
      "No timestamped readings for this period. Submit readings to build your history.";
  }

  const chart = buildChartPoints(readings);
  drawChart(chart.labels, chart.values);
}

document.querySelectorAll(".period-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentPeriod = button.dataset.period;

    document.querySelectorAll(".period-button").forEach((other) => {
      const active = other === button;
      other.classList.toggle("active", active);
      other.setAttribute("aria-pressed", String(active));
    });

    renderChart();
  });
});

$("simulation-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const value = $("moisture-input").value.trim();
  const moisture = Number(value);

  if (value === "" || !Number.isFinite(moisture) ||
      moisture < 0 || moisture > 100) {
    setMessage("Enter a soil moisture value from 0 to 100.", true);
    return;
  }

  const button = $("simulate-button");
  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const response = await fetch(`${API_URL}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soilMoisture: moisture })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to simulate reading.");
    }

    renderStatus(data);
    lastReading = moisture;

    setMessage(
      `Reading submitted: ${moisture}%. Pump is ${data.pumpOn ? "ON" : "OFF"}.`
    );
    addActivity(
      `Soil moisture ${moisture}%. Pump ${data.pumpOn ? "ON" : "OFF"}.`
    );
  } catch (error) {
    setMessage(
      `${error.message} Check that your local backend is running on port 3000.`,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Simulate";
  }
});

window.addEventListener("resize", () => renderChart());

getStatus();
