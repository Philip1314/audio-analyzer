function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

function detectClipping(buffer) {
  let clipped = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) >= 0.98) clipped++;
  }
  return (clipped / buffer.length) * 100;
}

function analyzeFFT(buffer, sampleRate) {
  const len = buffer.length;
  const win = buffer.slice(0, 16384);
  const spectrum = new Float32Array(win.length / 2);

  for (let k = 0; k < spectrum.length; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < win.length; n++) {
      const phase = (2 * Math.PI * k * n) / win.length;
      re += win[n] * Math.cos(phase);
      im -= win[n] * Math.sin(phase);
    }
    spectrum[k] = Math.sqrt(re * re + im * im);
  }

  const freqs = spectrum.map((val, i) => ({
    freq: i * sampleRate / win.length,
    mag: val
  }));

  const lowHum = freqs.find(f => f.freq >= 48 && f.freq <= 52);
  const midBuzz = freqs.find(f => f.freq >= 2000 && f.freq <= 4000);
  const plosive = freqs.find(f => f.freq >= 80 && f.freq <= 150);

  return {
    hasHum: lowHum && lowHum.mag > 200,
    hasBuzz: midBuzz && midBuzz.mag > 200,
    hasPlosive: plosive && plosive.mag > 300
  };
}

function analyzeAudio() {
  const fileInput = document.getElementById("audioFile");
  const file = fileInput.files[0];
  const resultDiv = document.getElementById("result");
  const loadingDiv = document.getElementById("loading");

  if (!file) {
    resultDiv.innerHTML = "<p>Please upload a file.</p>";
    return;
  }

  resultDiv.classList.add("hidden");
  loadingDiv.classList.remove("hidden");

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const reader = new FileReader();

  reader.onload = function (e) {
    const arrayBuffer = e.target.result;

    audioCtx.decodeAudioData(arrayBuffer, function (audioBuffer) {
      const channelData = audioBuffer.getChannelData(0); // mono
      const totalRMS = rms(channelData);
      const dB = 20 * Math.log10(totalRMS + 1e-8);
      const clippingPct = detectClipping(channelData);

      const frameSize = Math.floor(audioCtx.sampleRate * 0.5);
      let silentFrames = 0, totalFrames = 0;

      for (let i = 0; i < channelData.length; i += frameSize) {
        const frame = channelData.slice(i, i + frameSize);
        const frameRMS = rms(frame);
        const frameDB = 20 * Math.log10(frameRMS + 1e-8);
        if (frameDB < -35) silentFrames++;
        totalFrames++;
      }

      const silencePercent = (silentFrames / totalFrames) * 100;
      const noise = analyzeFFT(channelData, audioCtx.sampleRate);

      const isPass = (
        dB >= -30 && dB <= -12 &&
        silencePercent <= 25 &&
        clippingPct < 1 &&
        !noise.hasHum && !noise.hasBuzz && !noise.hasPlosive
      );

      loadingDiv.classList.add("hidden");
      resultDiv.classList.remove("hidden");

      resultDiv.innerHTML = `
        <p><b>Loudness:</b> ${dB.toFixed(2)} dBFS</p>
        <p><b>Silence:</b> ${silencePercent.toFixed(2)}%</p>
        <p><b>Clipping:</b> ${clippingPct.toFixed(2)}%</p>
        <p><b>Detected Noise:</b><br>
          ${noise.hasHum ? "⚠️ Hum detected<br>" : ""}
          ${noise.hasBuzz ? "⚠️ Buzz detected<br>" : ""}
          ${noise.hasPlosive ? "⚠️ Plosives detected<br>" : ""}
          ${(!noise.hasHum && !noise.hasBuzz && !noise.hasPlosive) ? "✅ None" : ""}
        </p>
        <p><b>Result:</b> <span class="${isPass ? "pass" : "fail"}">${isPass ? "✅ PASS" : "❌ FAIL"}</span></p>
      `;
    });
  };

  reader.readAsArrayBuffer(file);
}
