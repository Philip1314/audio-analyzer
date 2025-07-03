// --- UI Elements ---
const dropArea = document.getElementById('dropArea');
const audioFile = document.getElementById('audioFile');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorBox = document.getElementById('errorBox');
const errorMessage = document.getElementById('errorMessage');
const visualizationsDiv = document.getElementById('visualizations');
const waveformDiv = document.getElementById('waveform');
const spectrogramCanvas = document.getElementById('spectrogramCanvas');
const analysisResultsDiv = document.getElementById('analysisResults');
const rmsValueSpan = document.getElementById('rmsValue');
const lufsValueSpan = document.getElementById('lufsValue');
const snrValueSpan = document.getElementById('snrValue');
const dynamicRangeSpan = document.getElementById('dynamicRange');
const humCheckSpan = document.getElementById('humCheck');
const voicePresenceSpan = document.getElementById('voicePresence');
const transcriptionSpan = document.getElementById('transcription');
const pronunciationPaceSpan = document.getElementById('pronunciationPace');
const overallStatusP = document.getElementById('overallStatus');
const statusReasonP = document.getElementById('statusReason');
const downloadReportBtn = document.getElementById('downloadReportBtn');

// --- Wavesurfer.js Instance ---
let wavesurfer = null;

// --- Web Audio API Context ---
let audioContext = null;
let analyser = null;
let sourceNode = null;
let spectrogramAnimationFrameId = null;

// --- Helper Functions ---
function showElement(element) { element.classList.remove('hidden'); }
function hideElement(element) { element.classList.add('hidden'); }
function showError(message) {
    errorMessage.textContent = message;
    showElement(errorBox);
    hideElement(loadingIndicator);
    hideElement(visualizationsDiv);
    hideElement(analysisResultsDiv);
    hideElement(downloadReportBtn);
}
function clearResults() {
    rmsValueSpan.textContent = '-';
    lufsValueSpan.textContent = '-';
    snrValueSpan.textContent = '-';
    dynamicRangeSpan.textContent = '-';
    humCheckSpan.textContent = '-';
    voicePresenceSpan.textContent = '-';
    transcriptionSpan.textContent = '-';
    pronunciationPaceSpan.textContent = '-';
    overallStatusP.textContent = '-';
    statusReasonP.textContent = '-';
    hideElement(visualizationsDiv);
    hideElement(analysisResultsDiv);
    hideElement(downloadReportBtn);
    hideElement(errorBox);
}

// --- File Handling ---
dropArea.addEventListener('click', () => audioFile.click());
audioFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('highlight');
});
dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('highlight');
});
dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('highlight');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

async function handleFile(file) {
    clearResults();
    showElement(loadingIndicator);

    if (!file.type.startsWith('audio/')) {
        showError('Invalid file type. Please upload an audio file (.wav, .mp3, .ogg).');
        return;
    }

    try {
        // Check if WavesSurfer is defined before proceeding
        if (typeof WavesSurfer === 'undefined') {
            showError("The audio visualization library (Wavesurfer.js) is not loaded. Please check your internet connection or try again later.");
            return; // Stop execution if WavesSurfer is not available
        }

        // Initialize AudioContext if not already
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Stop previous audio if playing/analyzing
        if (sourceNode) {
            sourceNode.stop();
            sourceNode.disconnect();
            sourceNode = null;
        }
        if (analyser) {
            analyser.disconnect();
            analyser = null;
        }
        if (spectrogramAnimationFrameId) {
            cancelAnimationFrame(spectrogramAnimationFrameId);
            spectrogramAnimationFrameId = null;
        }

        // Decode audio for Web Audio API processing
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // --- Waveform Visualization (Wavesurfer.js) ---
        if (wavesurfer) {
            wavesurfer.destroy(); // Clean up previous instance
        }
        wavesurfer = WavesSurfer.create({
            container: '#waveform',
            waveColor: '#60a5fa', // Blue-400
            progressColor: '#3b82f6', // Blue-500
            cursorColor: '#93c5fd', // Blue-300
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 120,
            minPxPerSec: 10,
            fillParent: true,
            responsive: true,
            backend: 'WebAudio', // Use Web Audio API backend
            mediaControls: true, // Show play/pause controls
            dragToSeek: true,
            hideScrollbar: true,
        });
        wavesurfer.load(URL.createObjectURL(file));
        wavesurfer.on('ready', () => {
            hideElement(loadingIndicator);
            showElement(visualizationsDiv);
            showElement(analysisResultsDiv); // Show results section
            // Start client-side analysis after waveform is ready
            performClientSideAnalysis(audioBuffer);
            // Trigger simulated backend analysis
            simulateBackendAnalysis();
        });
        wavesurfer.on('error', (err) => {
            showError(`Error loading audio for waveform: ${err.message}`);
        });

        // --- Spectrogram Visualization (Web Audio API) ---
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Adjust for desired frequency resolution
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination); // Connect to speakers to hear sound

        sourceNode.start(0); // Start playing the audio
        sourceNode.onended = () => {
            if (spectrogramAnimationFrameId) {
                cancelAnimationFrame(spectrogramAnimationFrameId);
            }
            if (analyser) {
                analyser.disconnect();
            }
            if (sourceNode) {
                sourceNode.disconnect();
            }
            console.log('Audio playback ended.');
        };

        drawSpectrogram(dataArray, bufferLength);

    } catch (error) {
        console.error('Error processing audio file:', error);
        showError(`Failed to process audio file: ${error.message}. Make sure it's a valid audio format.`);
    }
}

// --- Spectrogram Drawing Function ---
function drawSpectrogram(dataArray, bufferLength) {
    const canvasCtx = spectrogramCanvas.getContext('2d');
    const width = spectrogramCanvas.clientWidth;
    const height = spectrogramCanvas.clientHeight;
    spectrogramCanvas.width = width;
    spectrogramCanvas.height = height;

    // Clear canvas
    canvasCtx.clearRect(0, 0, width, height);

    // Get frequency data
    analyser.getByteFrequencyData(dataArray);

    const barWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i]; // Value from 0-255
        const percent = value / 255;
        const barHeight = height * percent;

        // Create a color gradient for better visualization
        const hue = i / bufferLength * 360; // Map frequency to hue
        canvasCtx.fillStyle = `hsl(${hue}, 100%, ${50 + percent * 20}%)`; // Adjust lightness based on amplitude
        canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth;
    }
    spectrogramAnimationFrameId = requestAnimationFrame(() => drawSpectrogram(dataArray, bufferLength));
}

// --- Client-Side Analysis (Basic RMS) ---
function performClientSideAnalysis(audioBuffer) {
    // Simple RMS calculation
    let sumOfSquares = 0;
    const channelData = audioBuffer.getChannelData(0); // Get data from first channel

    for (let i = 0; i < channelData.length; i++) {
        sumOfSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumOfSquares / channelData.length);
    const rmsDb = 20 * Math.log10(rms); // Convert to dBFS (relative to full scale)

    rmsValueSpan.textContent = `${rmsDb.toFixed(2)} dBFS`;

    // Set initial overall status based on client-side RMS (very basic)
    if (rmsDb < -30) {
        overallStatusP.textContent = 'Needs Improvement';
        overallStatusP.classList.remove('text-green-700', 'text-red-700');
        overallStatusP.classList.add('text-yellow-700');
        statusReasonP.textContent = 'Audio seems very quiet. Consider increasing gain.';
    } else if (rmsDb > -5) {
        overallStatusP.textContent = 'Needs Improvement';
        overallStatusP.classList.remove('text-green-700', 'text-yellow-700');
        overallStatusP.classList.add('text-red-700');
        statusReasonP.textContent = 'Audio might be too loud or clipping. Check for distortion.';
    } else {
        overallStatusP.textContent = 'Good (Client-side RMS)';
        overallStatusP.classList.remove('text-yellow-700', 'text-red-700');
        overallStatusP.classList.add('text-green-700');
        statusReasonP.textContent = 'RMS level appears acceptable. Further analysis would require a backend.';
    }
}

// --- Simulated Backend Analysis (for GitHub Pages) ---
function simulateBackendAnalysis() {
    // Simulate a delay for "backend" processing
    setTimeout(() => {
        const mockBackendData = {
            lufs: -20.5,
            snr: 35.2,
            dynamic_range: 15.8,
            hum_detected: false,
            voice_presence: 0.85,
            hum_frequency: null,
            transcription: "This is a sample audio recording for analysis.",
            pronunciation_pace: "Good (150 WPM)",
            overall_status: "Pass",
            status_reason: "Simulated: All key metrics within acceptable ranges.",
        };

        lufsValueSpan.textContent = mockBackendData.lufs ? `${mockBackendData.lufs.toFixed(2)} LUFS` : '-';
        snrValueSpan.textContent = mockBackendData.snr ? `${mockBackendData.snr.toFixed(2)} dB` : '-';
        dynamicRangeSpan.textContent = mockBackendData.dynamic_range ? `${mockBackendData.dynamic_range.toFixed(2)} dB` : '-';
        humCheckSpan.textContent = mockBackendData.hum_detected ? `Detected (${mockBackendData.hum_frequency}Hz)` : 'None';
        voicePresenceSpan.textContent = mockBackendData.voice_presence ? `${(mockBackendData.voice_presence * 100).toFixed(1)}%` : '-';
        transcriptionSpan.textContent = mockBackendData.transcription || '-';
        pronunciationPaceSpan.textContent = mockBackendData.pronunciation_pace || '-';

        updateOverallStatus(mockBackendData);
        showElement(downloadReportBtn);
    }, 2000); // Simulate 2-second processing delay
}

// --- Update Overall Status based on (Simulated) Data ---
function updateOverallStatus(data) {
    const status = data.overall_status;
    overallStatusP.textContent = status;
    statusReasonP.textContent = data.status_reason || '';

    overallStatusP.classList.remove('text-green-700', 'text-yellow-700', 'text-red-700');
    if (status === 'Pass') {
        overallStatusP.classList.add('text-green-700');
    } else if (status === 'Needs Improvement') {
        overallStatusP.classList.add('text-yellow-700');
    } else if (status === 'Fail') {
        overallStatusP.classList.add('text-red-700');
    } else {
        overallStatusP.classList.add('text-gray-900'); // Default
    }
}

// --- Download Report (Placeholder) ---
downloadReportBtn.addEventListener('click', () => {
    // For a GitHub Pages only solution, PDF generation would be client-side.
    // A simple approach could be to use jsPDF to generate a basic report
    // based on the displayed (mocked) data.
    alert('PDF Report download functionality is a placeholder. A full report would require more advanced client-side PDF generation or a backend service.');
});

// --- Initial State and WavesSurfer Check ---
window.onload = () => {
    clearResults();
    hideElement(loadingIndicator);
    hideElement(visualizationsDiv);
    hideElement(analysisResultsDiv);
    hideElement(downloadReportBtn);
    hideElement(errorBox);

    // Check if WavesSurfer loaded successfully
    // This check is important because the script is loaded with 'defer'
    // and might not be immediately available when the DOM is ready.
    // The 'handleFile' function also has a check.
    setTimeout(() => { // Give a small delay to ensure deferred script has a chance to load
        if (typeof WavesSurfer === 'undefined') {
            console.error("WavesSurfer library is not defined. It might have failed to load from the CDN.");
            showError("The audio visualization library (Wavesurfer.js) failed to load. Please check your internet connection or try again later.");
        } else {
            console.log("WavesSurfer library loaded successfully.");
        }
    }, 500); // Check after 500ms
};

// Handle window resize for canvas responsiveness (spectrogram only)
window.addEventListener('resize', () => {
    if (analyser && sourceNode && sourceNode.buffer) {
        // Redraw spectrogram if audio is loaded
        if (spectrogramAnimationFrameId) {
            cancelAnimationFrame(spectrogramAnimationFrameId);
        }
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        drawSpectrogram(dataArray, bufferLength);
    }
});
