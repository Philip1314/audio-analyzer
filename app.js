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
      const intensity = Math.min(255, Math.floor(mag * 0.5));
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

function analyzeAudio() {
  const fileInput = document.getElementById("audioFile");
  const file = fileInput.files[0];
  const loading = document.getElementById("loading");
  const result = document.getElementById("result");

  if (!file) return alert("Please upload an audio file.");

  result.classList.add("hidden");
  loading.classList.remove("hidden");

  const reader = new FileReader();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  reader.onload = function (e) {
    const arrayBuffer = e.target.result;
    audioCtx.decodeAudioData(arrayBuffer, function (audioBuffer) {
      const channelData = audioBuffer.getChannelData(0);
      drawWaveform(channelData);
      drawSpectrogram(channelData, audioCtx.sampleRate);

      let hum = false, buzz = false, plosive = false;
      const fft = new Float32Array(8192);
      for (let i = 0; i < fft.length; i++) fft[i] = channelData[i] || 0;

      for (let k = 0; k < fft.length / 2; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < fft.length; n++) {
          const angle = (2 * Math.PI * k * n) / fft.length;
          re += fft[n] * Math.cos(angle);
          im -= fft[n] * Math.sin(angle);
        }
        const mag = Math.sqrt(re * re + im * im);
        const freq = k * audioCtx.sampleRate / fft.length;

        if (freq >= 48 && freq <= 52 && mag > 100) hum = true;
        if (freq >= 2000 && freq <= 4000 && mag > 120) buzz = true;
        if (freq >= 80 && freq <= 150 && mag > 160) plosive = true;
      }

      let issues = [];
      if (hum) issues.push("⚠️ Hum detected");
      if (buzz) issues.push("⚠️ Buzz detected");
      if (plosive) issues.push("⚠️ Plosive detected");
      if (issues.length === 0) issues.push("✅ Clean recording");

      loading.classList.add("hidden");
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
