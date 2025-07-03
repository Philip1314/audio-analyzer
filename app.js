if (!location.hostname.endsWith("github.io")) {
  alert("This app only works on GitHub Pages.");
  document.body.innerHTML = "<h2 style='color:red;text-align:center;'>⛔ This app only runs on GitHub Pages.</h2>";
  throw new Error("Blocked: Not on GitHub Pages.");
}

function showFileName() {
  const input = document.getElementById("audioFile");
  const audioPlayer = document.getElementById("audioPlayer");
  const nameTag = document.getElementById("fileName");

  if (input.files.length > 0) {
    const file = input.files[0];
    nameTag.textContent = `Selected: ${file.name}`;
    audioPlayer.src = URL.createObjectURL(file);
    audioPlayer.classList.remove("hidden");
  } else {
    nameTag.textContent = "No file selected.";
    audioPlayer.classList.add("hidden");
  }
}

function drawWaveform(data) {
  const canvas = document.getElementById("waveformCanvas");
  const ctx = canvas.getContext("2d");
  canvas.classList.remove("hidden");

  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 100;
  ctx.clearRect(0, 0, width, height);

  const samplesPerPixel = Math.floor(data.length / width);
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = 0; i < samplesPerPixel; i++) {
      const sample = data[x * samplesPerPixel + i] || 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samplesPerPixel);
    const dB = 20 * Math.log10(rms + 1e-8);
    const y = height - ((dB + 60) / 60) * height;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#005eff";
  ctx.stroke();
}

async function analyzeAudio() {
  const input = document.getElementById("audioFile");
  const result = document.getElementById("result");
  const loading = document.getElementById("loading");
  const progressWrapper = document.getElementById("progressWrapper");
  const progressBar = document.getElementById("progressBar");

  if (!input.files[0]) return alert("Upload an audio file first.");

  result.classList.add("hidden");
  loading.classList.remove("hidden");
  progressWrapper.classList.remove("hidden");
  loading.textContent = "🔍 Analyzing... 0%";

  const reader = new FileReader();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  reader.onload = function (e) {
    audioCtx.decodeAudioData(e.target.result, async (buffer) => {
      const data = buffer.getChannelData(0);
      drawWaveform(data);

      const sampleRate = buffer.sampleRate;
      const totalChunks = Math.floor(data.length / 8192);
      let hum = false, buzz = false, plosive = false, backgroundNoise = false, lowRMS = false;

      // For scoring
      let silentGaps = 0, totalEnergy = 0, peakEnergy = 0;
      let variation = 0, lastAmp = 0;
      let echo = false, echoScore = 0;

      for (let c = 0; c < totalChunks; c++) {
        const chunk = data.slice(c * 8192, (c + 1) * 8192);
        let sum = 0;
        let peak = 0;

        for (let i = 0; i < chunk.length; i++) {
          const val = chunk[i];
          sum += val * val;
          peak = Math.max(peak, Math.abs(val));
          variation += Math.abs(val - lastAmp);
          lastAmp = val;
        }

        const rms = Math.sqrt(sum / chunk.length);
        totalEnergy += rms;
        peakEnergy = Math.max(peakEnergy, peak);

        // Detect background noise on silence
        if (rms < 0.01 && peak > 0.02) silentGaps++;
        if (rms > 0.2) backgroundNoise = true;
        if (rms < 0.01) lowRMS = true;

        // FFT-based heuristics (optional improvements can be added later)
        // Simulated checks for known problems
        if (c === 0) {
          hum = data.some(v => Math.abs(v) > 0.005 && Math.abs(v) < 0.02);
          buzz = data.some(v => Math.abs(v) > 0.03 && Math.abs(v) < 0.05);
          plosive = data.some(v => Math.abs(v) > 0.6);
        }

        const percent = Math.floor((c / totalChunks) * 100);
        loading.textContent = `🔍 Analyzing... ${percent}%`;
        progressBar.style.width = `${percent}%`;
        await new Promise(r => setTimeout(r, 5));
      }

      // Echo detection via autocorrelation
      const maxLag = Math.floor(sampleRate * 0.05);
      for (let lag = sampleRate * 0.02; lag < maxLag; lag += 100) {
        let sum = 0;
        for (let i = 0; i < data.length - lag; i += 1000) {
          sum += data[i] * data[i + lag];
        }
        echoScore = Math.max(echoScore, sum);
      }
      if (echoScore > 100) echo = true;

      // Calculate scores
      const qualityScore = Math.max(1, 5 - (
        (hum ? 1 : 0) +
        (buzz ? 1 : 0) +
        (plosive ? 1 : 0) +
        (backgroundNoise ? 1 : 0) +
        (lowRMS ? 1 : 0)
      ));

      let naturalScore = 5;
      if (silentGaps > 5) naturalScore -= 1;
      if (variation < 1.0) naturalScore -= 1; // monotone
      if (peakEnergy > 0.9) naturalScore -= 1; // overacting
      if (echo) naturalScore -= 1;

      // Interpret naturalness comments
      let naturalnessComments = [];
      if (silentGaps > 5) naturalnessComments.push("⚠️ Awkward pacing");
      if (variation < 1.0) naturalnessComments.push("⚠️ Monotone delivery");
      if (peakEnergy > 0.9) naturalnessComments.push("⚠️ Overacting or excessive loudness");
      if (naturalnessComments.length === 0) naturalnessComments.push("✅ Natural sounding voice");

      // Clean up UI
      loading.classList.add("hidden");
      progressWrapper.classList.add("hidden");
      progressBar.style.width = "0%";
      result.classList.remove("hidden");

      const failClass = (s) => s <= 2 ? 'fail' : 'pass';

      result.innerHTML = `
        <h3>🔊 Audio Quality Score: <span class="${failClass(qualityScore)}">${qualityScore}/5</span></h3>
        <h3>🎙 Voice Naturalness Score: <span class="${failClass(naturalScore)}">${naturalScore}/5</span></h3>

        <p><b>🎧 Noise Detection:</b><br>
          ${hum ? "⚠️ Hum<br>" : ""}
          ${buzz ? "⚠️ Buzz<br>" : ""}
          ${plosive ? "⚠️ Plosive<br>" : ""}
          ${backgroundNoise ? "⚠️ Background Noise<br>" : ""}
          ${lowRMS ? "⚠️ Too Quiet<br>" : ""}
          ${echo ? "⚠️ Echo<br>" : ""}
          ${(hum || buzz || plosive || backgroundNoise || echo || lowRMS) ? "" : "✅ Clean Recording"}
        </p>

        <p><b>🗣️ Voice Naturalness:</b><br>
          ${naturalnessComments.join("<br>")}
        </p>
      `;
    });
  };

  reader.readAsArrayBuffer(input.files[0]);
}
