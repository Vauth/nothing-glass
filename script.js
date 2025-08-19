document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const imageUpload = document.getElementById('image-upload');
    const fileNameDisplay = document.getElementById('file-name-display');
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loader = document.getElementById('loader');
    const uploadPromptContainer = document.getElementById('upload-prompt-container');
    const downloadBtn = document.getElementById('download-btn');
    
    // --- Sliders and Value Displays ---
    const blurSlider = document.getElementById('blur-slider'),
        widthSlider = document.getElementById('width-slider'),
        amplitudeSlider = document.getElementById('amplitude-slider'),
        lightingSlider = document.getElementById('lighting-slider');

    const blurValue = document.getElementById('blur-value'),
        widthValue = document.getElementById('width-value'),
        amplitudeValue = document.getElementById('amplitude-value'),
        lightingValue = document.getElementById('lighting-value');
    
    // --- State Variables ---
    let originalImage = null;
    let fullResolutionCanvas = null;
    let debounceTimer;

    /**
     * Updates the text content of slider value displays.
     */
    function updateSliderValues() {
        blurValue.textContent = blurSlider.value;
        widthValue.textContent = widthSlider.value;
        amplitudeValue.textContent = amplitudeSlider.value;
        lightingValue.textContent = lightingSlider.value; // Update new display
    }
    
    /**
     * Draws an image to the preview canvas, scaling it to fit its container.
     * @param {HTMLImageElement | HTMLCanvasElement} img The image or canvas to draw.
     */
    function drawPreviewImage(img) {
        const container = document.getElementById('canvas-container');
        const containerRatio = container.clientWidth / container.clientHeight;
        const imgRatio = img.width / img.height;
        let drawWidth, drawHeight;

        if (containerRatio > imgRatio) {
            drawHeight = container.clientHeight;
            drawWidth = drawHeight * imgRatio;
        } else {
            drawWidth = container.clientWidth;
            drawHeight = drawWidth / imgRatio;
        }
        
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    
    /**
     * Applies all selected visual effects to the original image.
     * This function is asynchronous to allow the UI to update with a loader.
     */
    async function applyEffects() {
        if (!originalImage) return;
        loader.classList.remove('hidden');
        await new Promise(resolve => setTimeout(resolve, 20)); // Allow UI to update
        
        // --- Get current values from sliders ---
        const blur = parseFloat(blurSlider.value);
        const reedWidth = parseInt(widthSlider.value);
        const amplitude = parseInt(amplitudeSlider.value);
        const lighting = parseInt(lightingSlider.value); // Get lighting value
        
        // Create a canvas for the final output at full resolution
        const finalCanvas = document.createElement('canvas');
        const finalCtx = finalCanvas.getContext('2d');
        finalCanvas.width = originalImage.width;
        finalCanvas.height = originalImage.height;
        
        // --- Apply Blur ---
        // A padded canvas is used for blurring to prevent transparent edges.
        if (blur > 0) {
            const blurCanvas = document.createElement('canvas');
            const blurCtx = blurCanvas.getContext('2d');
            const padding = blur * 2;
            blurCanvas.width = originalImage.width + padding * 2;
            blurCanvas.height = originalImage.height + padding * 2;
            
            blurCtx.drawImage(originalImage, padding, padding);
            blurCtx.filter = `blur(${blur}px)`;
            blurCtx.drawImage(blurCanvas, 0, 0); // Apply blur by drawing itself
            blurCtx.filter = 'none';

            // Draw the central, non-bordered part back to the final canvas
            finalCtx.drawImage(blurCanvas, padding, padding, originalImage.width, originalImage.height, 0, 0, originalImage.width, originalImage.height);
        } else {
            finalCtx.drawImage(originalImage, 0, 0);
        }
        
        // --- Apply Distortion and Lighting ---
        if (amplitude > 0 || lighting > 0) {
            const baseImageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const distortedImageData = applyDistortionAndLighting(baseImageData, finalCanvas.width, finalCanvas.height, reedWidth, amplitude, lighting);
            finalCtx.putImageData(distortedImageData, 0, 0);
        }
        
        // Store the full-resolution canvas for downloading.
        fullResolutionCanvas = finalCanvas;
        
        // Draw the final result to the visible canvas for preview.
        drawPreviewImage(fullResolutionCanvas);
        loader.classList.add('hidden');
    }
    
    /**
     * Applies a vertical reeded glass distortion and a 3D lighting effect.
     * @param {ImageData} imageData The source image data.
     * @param {number} width The width of the image.
     * @param {number} height The height of the image.
     * @param {number} reedWidth The width of each "reed" or distortion wave.
     * @param {number} amplitude The intensity of the horizontal pixel shift.
     * @param {number} lighting The intensity of the highlight/shadow effect.
     * @returns {ImageData} The new image data with effects applied.
     */
    function applyDistortionAndLighting(imageData, width, height, reedWidth, amplitude, lighting) {
        const src = imageData.data;
        const dst = new Uint8ClampedArray(src.length);
        const displacement = new Float32Array(width);
        const shading = new Float32Array(width); // Array to hold shading values

        // Pre-calculate displacement and shading for each vertical column
        for (let x = 0; x < width; x++) {
            const angle = 2 * Math.PI * x / reedWidth;
            displacement[x] = amplitude * Math.sin(angle);
            // Cosine gives a -1 to 1 value that simulates light hitting a curved surface
            shading[x] = lighting * Math.cos(angle); 
        }
        
        // Apply the pre-calculated values to each pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = Math.round(x + displacement[x]);
                const clampedX = Math.max(0, Math.min(width - 1, srcX));
                
                const dstIdx = (y * width + x) * 4;
                const srcIdx = (y * width + clampedX) * 4;
                
                const brightnessChange = shading[x];

                // Apply displacement and add the lighting effect.
                // Uint8ClampedArray automatically clamps values between 0 and 255.
                dst[dstIdx]     = src[srcIdx]     + brightnessChange; // R
                dst[dstIdx + 1] = src[srcIdx + 1] + brightnessChange; // G
                dst[dstIdx + 2] = src[srcIdx + 2] + brightnessChange; // B
                dst[dstIdx + 3] = src[srcIdx + 3];                      // Alpha
            }
        }
        
        return new ImageData(dst, width, height);
    }
    
    // --- Event Listeners ---

    // Add listeners to all sliders to re-apply effects on change
    [blurSlider, widthSlider, amplitudeSlider, lightingSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            updateSliderValues();
            if (originalImage) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => requestAnimationFrame(applyEffects), 50);
            }
        });
    });
    
    // Listener for the file input
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
            const reader = new FileReader();
            reader.onload = (event) => {
                originalImage = new Image();
                originalImage.onload = () => {
                    uploadPromptContainer.style.display = 'none';
                    applyEffects();
                    downloadBtn.disabled = false;
                };
                originalImage.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Listener for the download button
    downloadBtn.addEventListener('click', () => {
        if (!fullResolutionCanvas) return;
        const link = document.createElement('a');
        link.download = `glass-effect-${Date.now()}.png`;
        link.href = fullResolutionCanvas.toDataURL('image/png');
        link.click();
    });
    
    // Redraw preview on window resize to keep it fitting correctly
    window.addEventListener('resize', () => {
        if (fullResolutionCanvas) {
            drawPreviewImage(fullResolutionCanvas);
        }
    });
    
    // --- Initial Setup ---
    updateSliderValues();
});
