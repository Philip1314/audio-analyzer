// Only run on GitHub Pages
if (!location.hostname.endsWith("github.io")) {
  alert("This app only works on GitHub Pages.");
  document.body.innerHTML = "<h2 style='color:red;text-align:center;'>⛔ This app only runs on GitHub Pages.</h2>";
  throw new Error("Blocked: Not on GitHub Pages.");
}

function showFileName() {
  const fileInput = document.getElementById("audioFile");
  const fileNameDiv = document.getElementById("fileName");
  const audioPlayer = document.getElementById("audioPlayer");
  const waveformCanvas = document.getElementById("waveformCanvas");
  const spectrogramCanvas = document.getElementById("spectrogramCanvas");

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    fileNameDiv.textContent = `Selected: ${file.name}`;
    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    audioPlayer.classList.remove("hidden");
    waveformCanvas.classList.add("hidden");
    spectrogramCanvas.classList.add("hidden");
  } else {
    fileNameDiv.textContent = "No file selected.";
    audioPlayer.classList.add("hidden");
  }
}

function drawWaveform(channelData) {
  const canvas = document.getElementById("waveformCanvas");
  const ctx = canvas.getContext("2d");
  canvas.classList.remove("hidden");
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 120;
  ctx.clearRect(0, 0, width, height);

  const samplesPerPixel = Math.floor(channelData.length / width);
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = 0; i < samplesPerPixel; i++) {
      const sample = channelData[x * samplesPerPixel + i] || 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samplesPerPixel);
    const dB = 20 * Math.log10(rms + 1e-8);
    const y = height - ((dB + 60) / 60) * height;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#005eff";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawSpectrogram(channelData, sampleRate) {
  const canvas = document.getElementById("spectrogramCanvas");
  const ctx = canvas.getContext("2d");
  canvas.classList.remove("hidden");
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 120;

  const sliceSize = 1024;
  const step = sliceSize;
  let offset = 0;
  const buffer = channelData.slice(0);
  ctx.clearRect(0, 0, width, height);
  const imageData = ctx.createImageData(width, height);
  let x = 0;

  while (offset + sliceSize < buffer.length && x < width) {
    const slice = buffer.slice(offset, offset + sliceSize);
    const spectrum = new Float32Array(sliceSize / 2);
    for (let k = 0; k < spectrum.length; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < slice.length; n++) {
        const angle = (2 * Math.PI * k * n) / slice.length;
        re += slice[n] * Math.cos(angle);
        im -= slice[n] * Math.sin(angle);
      }
      spectrum[k] = Math.sqrt(re * re + im * im);
    }

    for (let y = 0; y < height; y++) {
      const i = Math.floor((y / height) * spectrum.length);
      const mag = spectrum[i];
      const intensity = Math.min(255, Math.floor(mag * 5));
      const pixelIndex = ((height - y - 1) * width + x) * 4;
      imageData.data[pixelIndex + 0] = intensity;
      imageData.data[pixelIndex + 1] = intensity * 0.7;
      imageData.data[pixelIndex + 2] = 255 - intensity;
      imageData.data[pixelIndex + 3] = 255;
    }

    offset += step;
    x++;
  }

  ctx.putImageData(imageData, 0, 0);
}

async function analyzeAudio() {
  const fileInput = document.getElementById("audioFile");
  const file = fileInput.files[0];
  const loading = document.getElementById("loading");
  const result = document.getElementById("result");
  const progressWrapper = document.getElementById("progressWrapper");
  const progressBar = document.getElementById("progressBar");

  if (!file) return alert("Please upload an audio file.");

  result.classList.add("hidden");
  loading.classList.remove("hidden");
  loading.textContent = "🔍 Analyzing... 0%";
  progressWrapper.classList.remove("hidden");

  const reader = new FileReader();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  reader.onload = function (e) {
    const arrayBuffer = e.target.result;
    audioCtx.decodeAudioData(arrayBuffer, async function (audioBuffer) {
      const channelData = audioBuffer.getChannelData(0);
      drawWaveform(channelData);
      drawSpectrogram(channelData, audioCtx.sampleRate);

      const chunkSize = 8192;
      const totalChunks = Math.floor(channelData.length / (chunkSize * 4));
      let hum = false, buzz = false, plosive = false;

      for (let c = 0; c < totalChunks; c++) {
        const offset = c * chunkSize * 4;
        const fft = new Float32Array(chunkSize);
        for (let i = 0; i < chunkSize; i++) fft[i] = channelData[offset + i] || 0;

        for (let k = 0; k < chunkSize / 2; k++) {
          let re = 0, im = 0;
          for (let n = 0; n < chunkSize; n++) {
            const angle = (2 * Math.PI * k * n) / chunkSize;
            re += fft[n] * Math.cos(angle);
            im -= fft[n] * Math.sin(angle);
          }
          const mag = Math.sqrt(re * re + im * im);
          const freq = k * audioCtx.sampleRate / chunkSize;

          if (freq >= 48 && freq <= 52 && mag > 0.01) hum = true;
          if (freq >= 2000 && freq <= 4000 && mag > 0.01) buzz = true;
          if (freq >= 80 && freq <= 150 && mag > 0.01) plosive = true;
        }

        const percent = Math.floor((c / totalChunks) * 100);
        loading.textContent = `🔍 Analyzing... ${percent}%`;
        progressBar.style.width = `${percent}%`;
        await new Promise(r => setTimeout(r, 10));
      }

      loading.classList.add("hidden");
      progressWrapper.classList.add("hidden");
      progressBar.style.width = "0%";

      let issues = [];
      if (hum) issues.push("⚠️ Hum detected");
      if (buzz) issues.push("⚠️ Buzz detected");
      if (plosive) issues.push("⚠️ Plosive detected");
      if (issues.length === 0) issues.push("✅ Clean recording");

      result.classList.remove("hidden");
      result.innerHTML = `
        <p><b>Noise Analysis:</b><br>${issues.join("<br>")}</p>
        <p><b>Result:</b> <span class="${hum || buzz || plosive ? 'fail' : 'pass'}">
          ${hum || buzz || plosive ? "❌ FAIL" : "✅ PASS"}
        </span></p>
      `;
    });
  };

  reader.readAsArrayBuffer(file);
}
