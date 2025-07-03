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
      const sampleRate = buffer.sampleRate;
      drawWaveform(data);

      const totalSamples = data.length;
      const windowSize = 2048;
      let hum = false, buzz = false, plosive = false;
      let backgroundNoise = false, lowRMS = false;
      let echo = false, echoScore = 0;

      // Voice naturalness metrics
      let silentGaps = 0, variation = 0, lastAmp = 0, peakEnergy = 0;

      for (let i = 0; i < totalSamples; i += windowSize) {
        const slice = data.slice(i, i + windowSize);
        let sum = 0;
        let peak = 0;

        for (let j = 0; j < slice.length; j++) {
          const val = slice[j];
          sum += val * val;
          peak = Math.max(peak, Math.abs(val));
          variation += Math.abs(val - lastAmp);
          lastAmp = val;
        }

        const rms = Math.sqrt(sum / slice.length);
        if (rms < 0.01 && peak > 0.02) silentGaps++;
        if (rms > 0.2) backgroundNoise = true;
        if (rms < 0.01) lowRMS = true;
        peakEnergy = Math.max(peakEnergy, peakEnergy, peak);

        // Simulated FFT-based noise detection (approx)
        if (!hum && slice.some(v => Math.abs(v) > 0.005 && Math.abs(v) < 0.02)) hum = true;
        if (!buzz && slice.some(v => Math.abs(v) > 0.03 && Math.abs(v) < 0.05)) buzz = true;
        if (!plosive && slice.some(v => Math.abs(v) > 0.6)) plosive = true;

        const percent = Math.floor((i / totalSamples) * 100);
        loading.textContent = `🔍 Analyzing... ${percent}%`;
        progressBar.style.width = `${percent}%`;
        await new Promise(r => setTimeout(r, 1)); // smooth UI
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

      // 📊 Scoring
      const qualityScore = Math.max(1, 5 - (
        (hum ? 1 : 0) +
        (buzz ? 1 : 0) +
        (plosive ? 1 : 0) +
        (backgroundNoise ? 1 : 0) +
        (lowRMS ? 1 : 0)
      ));

      let naturalScore = 5;
      if (silentGaps > 5) naturalScore -= 1;
      if (variation < 1.0) naturalScore -= 1;
      if (peakEnergy > 0.9) naturalScore -= 1;
      if (echo) naturalScore -= 1;

      // 📌 Comments for naturalness
      const naturalnessComments = [];
      if (silentGaps > 5) naturalnessComments.push("⚠️ Awkward pacing");
      if (variation < 1.0) naturalnessComments.push("⚠️ Monotone delivery");
      if (peakEnergy > 0.9) naturalnessComments.push("⚠️ Overacting or excessive loudness");
      if (naturalnessComments.length === 0) naturalnessComments.push("✅ Natural sounding voice");

      // Final display
      const failClass = (s) => s <= 2 ? 'fail' : 'pass';

      loading.classList.add("hidden");
      progressWrapper.classList.add("hidden");
      progressBar.style.width = "0%";
      result.classList.remove("hidden");

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
