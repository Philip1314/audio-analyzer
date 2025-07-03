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
/**
 * Shows a given HTML element by removing the 'hidden' class.
 * @param {HTMLElement} element - The HTML element to show.
 */
function showElement(element) {
    element.classList.remove('hidden');
}

/**
 * Hides a given HTML element by adding the 'hidden' class.
 * @param {HTMLElement} element - The HTML element to hide.
 */
function hideElement(element) {
    element.classList.add('hidden');
}

/**
 * Displays an error message in the UI and hides other sections.
 * @param {string} message - The error message to display.
 */
function showError(message) {
    errorMessage.textContent = message;
    showElement(errorBox);
    hideElement(loadingIndicator);
    hideElement(visualizationsDiv);
    hideElement(analysisResultsDiv);
    hideElement(downloadReportBtn);
}

/**
 * Clears all displayed analysis results and hides result sections.
 */
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

// --- File Handling Event Listeners ---
// Click on drop area triggers file input click
dropArea.addEventListener('click', () => audioFile.click());

// Handle file selection via input
audioFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drag and drop events for visual feedback
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault(); // Prevent default to allow drop
    dropArea.classList.add('highlight'); // Add highlight style
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('highlight'); // Remove highlight style
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault(); // Prevent default file opening
    dropArea.classList.remove('highlight'); // Remove highlight style
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]); // Process dropped file
    }
});

/**
 * Handles the selected audio file: validates, decodes, visualizes, and performs analysis.
 * @param {File} file - The audio file to process.
 */
async function handleFile(file) {
    clearResults(); // Clear previous results
    showElement(loadingIndicator); // Show loading indicator

    // Validate file type
    if (!file.type.startsWith('audio/')) {
        showError('Invalid file type. Please upload an audio file (.wav, .mp3, .ogg).');
        return;
    }

    try {
        // Crucial check: Ensure WavesSurfer library is loaded
        if (typeof WavesSurfer === 'undefined') {
            showError("The audio visualization library (Wavesurfer.js) is not loaded. Please check your internet connection or try again later.");
            return;
        }

        // Initialize AudioContext if not already present
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Stop any previous audio processing
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

        // Decode audio data for Web Audio API processing
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // --- Waveform Visualization (Wavesurfer.js) ---
        // Destroy existing Wavesurfer instance if it exists to prevent memory leaks
        if (wavesurfer) {
            wavesurfer.destroy();
        }
        wavesurfer = WavesSurfer.create({
            container: '#waveform', // Target HTML element for waveform
            waveColor: '#60a5fa', // Color of the waveform bars
            progressColor: '#3b82f6', // Color of the played portion of the waveform
            cursorColor: '#93c5fd', // Color of the playback cursor
            barWidth: 2, // Width of each waveform bar
            barGap: 1, // Gap between waveform bars
            barRadius: 2, // Border radius for bars
            height: 120, // Fixed height for the waveform visualization
            minPxPerSec: 10, // Minimum pixels per second for zoom level
            fillParent: true, // Make waveform fill its container
            responsive: true, // Make waveform responsive to container size changes
            backend: 'WebAudio', // Use Web Audio API for audio processing
            mediaControls: true, // Show default play/pause controls
            dragToSeek: true, // Allow seeking by dragging the waveform
            hideScrollbar: true, // Hide horizontal scrollbar
        });
        wavesurfer.load(URL.createObjectURL(file)); // Load the audio file

        // Event listener for when Wavesurfer is ready (audio loaded and decoded)
        wavesurfer.on('ready', () => {
            hideElement(loadingIndicator); // Hide loading indicator
            showElement(visualizationsDiv); // Show visualizations section
            showElement(analysisResultsDiv); // Show analysis results section

            // Perform client-side analysis
            performClientSideAnalysis(audioBuffer);
            // Trigger simulated backend analysis (for demonstration)
            simulateBackendAnalysis();
        });

        // Event listener for Wavesurfer errors
        wavesurfer.on('error', (err) => {
            showError(`Error loading audio for waveform: ${err.message}`);
        });

        // --- Spectrogram Visualization (Web Audio API) ---
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Fast Fourier Transform size (power of 2 for efficiency)
        const bufferLength = analyser.frequencyBinCount; // Number of data points in the frequency domain
        const dataArray = new Uint8Array(bufferLength); // Array to hold frequency data (0-255)

        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(analyser); // Connect audio source to analyser
        analyser.connect(audioContext.destination); // Connect analyser to speakers to hear the sound

        sourceNode.start(0); // Start playing the audio from the beginning

        // Event listener for when audio playback ends
        sourceNode.onended = () => {
            if (spectrogramAnimationFrameId) {
                cancelAnimationFrame(spectrogramAnimationFrameId); // Stop spectrogram animation
            }
            if (analyser) {
                analyser.disconnect(); // Disconnect analyser
            }
            if (sourceNode) {
                sourceNode.disconnect(); // Disconnect source
            }
            console.log('Audio playback ended.');
        };

        // Start the spectrogram drawing loop
        drawSpectrogram(dataArray, bufferLength);

    } catch (error) {
        console.error('Error processing audio file:', error);
        showError(`Failed to process audio file: ${error.message}. Make sure it's a valid audio format.`);
    }
}

/**
 * Draws the spectrogram visualization on the canvas.
 * This function is called repeatedly via requestAnimationFrame.
 * @param {Uint8Array} dataArray - The array to store frequency data.
 * @param {number} bufferLength - The length of the frequency data buffer.
 */
function drawSpectrogram(dataArray, bufferLength) {
    const canvasCtx = spectrogramCanvas.getContext('2d');
    // Ensure canvas dimensions match its display size for proper scaling
    const width = spectrogramCanvas.clientWidth;
    const height = spectrogramCanvas.clientHeight;
    spectrogramCanvas.width = width;
    spectrogramCanvas.height = height;

    canvasCtx.clearRect(0, 0, width, height); // Clear the canvas for redrawing

    analyser.getByteFrequencyData(dataArray); // Populate dataArray with frequency data

    const barWidth = width / bufferLength; // Calculate width of each frequency bar
    let x = 0; // X-coordinate for drawing bars

    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i]; // Frequency amplitude (0-255)
        const percent = value / 255; // Normalize to 0-1
        const barHeight = height * percent; // Calculate bar height relative to canvas height

        // Create a color gradient based on frequency and amplitude for visual appeal
        const hue = i / bufferLength * 360; // Map frequency (index) to hue (0-360)
        canvasCtx.fillStyle = `hsl(${hue}, 100%, ${50 + percent * 20}%)`; // Adjust lightness based on amplitude
        canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight); // Draw the bar

        x += barWidth; // Move to the next X position
    }
    // Request next animation frame to continue drawing
    spectrogramAnimationFrameId = requestAnimationFrame(() => drawSpectrogram(dataArray, bufferLength));
}

/**
 * Performs basic client-side audio analysis (RMS loudness).
 * @param {AudioBuffer} audioBuffer - The decoded audio buffer.
 */
function performClientSideAnalysis(audioBuffer) {
    let sumOfSquares = 0;
    // Get audio data from the first channel (assuming mono or taking first channel of stereo)
    const channelData = audioBuffer.getChannelData(0);

    // Calculate sum of squares of all samples
    for (let i = 0; i < channelData.length; i++) {
        sumOfSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumOfSquares / channelData.length); // Calculate RMS
    const rmsDb = 20 * Math.log10(rms); // Convert RMS to dBFS (decibels relative to full scale)

    rmsValueSpan.textContent = `${rmsDb.toFixed(2)} dBFS`; // Display RMS value

    // Provide a very basic initial overall status based on client-side RMS
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

/**
 * Simulates advanced backend analysis results for demonstration purposes.
 * In a real application, this would involve an actual API call to a server.
 */
function simulateBackendAnalysis() {
    // Simulate a delay to mimic server processing time
    setTimeout(() => {
        // Mock data representing typical backend analysis results
        const mockBackendData = {
            lufs: -20.5,
            snr: 35.2,
            dynamic_range: 15.8,
            hum_detected: false,
            voice_presence: 0.85, // 85% voice presence
            hum_frequency: null,
            transcription: "This is a sample audio recording for analysis.",
            pronunciation_pace: "Good (150 Words Per Minute)",
            overall_status: "Pass",
            status_reason: "Simulated: All key metrics within acceptable ranges.",
        };

        // Update UI with simulated backend results
        lufsValueSpan.textContent = mockBackendData.lufs ? `${mockBackendData.lufs.toFixed(2)} LUFS` : '-';
        snrValueSpan.textContent = mockBackendData.snr ? `${mockBackendData.snr.toFixed(2)} dB` : '-';
        dynamicRangeSpan.textContent = mockBackendData.dynamic_range ? `${mockBackendData.dynamic_range.toFixed(2)} dB` : '-';
        humCheckSpan.textContent = mockBackendData.hum_detected ? `Detected (${mockBackendData.hum_frequency}Hz)` : 'None';
        voicePresenceSpan.textContent = mockBackendData.voice_presence ? `${(mockBackendData.voice_presence * 100).toFixed(1)}%` : '-';
        transcriptionSpan.textContent = mockBackendData.transcription || '-';
        pronunciationPaceSpan.textContent = mockBackendData.pronunciation_pace || '-';

        // Update the overall status based on simulated data
        updateOverallStatus(mockBackendData);
        showElement(downloadReportBtn); // Show the download report button
    }, 2000); // 2-second delay
}

/**
 * Updates the overall status and reason displayed in the UI.
 * @param {object} data - The analysis data containing overall_status and status_reason.
 */
function updateOverallStatus(data) {
    const status = data.overall_status;
    overallStatusP.textContent = status;
    statusReasonP.textContent = data.status_reason || '';

    // Apply appropriate text color based on status
    overallStatusP.classList.remove('text-green-700', 'text-yellow-700', 'text-red-700');
    if (status === 'Pass') {
        overallStatusP.classList.add('text-green-700');
    } else if (status === 'Needs Improvement') {
        overallStatusP.classList.add('text-yellow-700');
    } else if (status === 'Fail') {
        overallStatusP.classList.add('text-red-700');
    } else {
        overallStatusP.classList.add('text-gray-900'); // Default color
    }
}

// --- Download Report (Placeholder) ---
downloadReportBtn.addEventListener('click', () => {
    // This is a placeholder. For a GitHub Pages only solution,
    // PDF generation would need to be done client-side using a library
    // like jsPDF, or by sending data to a backend service for PDF creation.
    alert('PDF Report download functionality is a placeholder. A full report would require more advanced client-side PDF generation or a backend service.');
});

// --- Initial State and Library Load Check ---
window.onload = () => {
    clearResults(); // Clear any initial results
    hideElement(loadingIndicator);
    hideElement(visualizationsDiv);
    hideElement(analysisResultsDiv);
    hideElement(downloadReportBtn);
    hideElement(errorBox);

    // Check if WavesSurfer loaded successfully after a short delay
    // This gives the deferred script time to execute.
    setTimeout(() => {
        if (typeof WavesSurfer === 'undefined') {
            console.error("WavesSurfer library is not defined. It might have failed to load from the CDN.");
            showError("The audio visualization library (Wavesurfer.js) failed to load. Please check your internet connection or try again later.");
        } else {
            console.log("WavesSurfer library loaded successfully.");
        }
    }, 500); // Check after 500ms
};

// --- Responsive Canvas Resizing ---
// Handle window resize to make spectrogram canvas responsive
window.addEventListener('resize', () => {
    // Only redraw spectrogram if audio is currently loaded and being analyzed
    if (analyser && sourceNode && sourceNode.buffer) {
        if (spectrogramAnimationFrameId) {
            cancelAnimationFrame(spectrogramAnimationFrameId); // Stop current animation
        }
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        drawSpectrogram(dataArray, bufferLength); // Redraw with new dimensions
    }
});
