document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const imageUpload = document.getElementById('image-upload');
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

    // Safety constraint to prevent memory crashes on large images
    const MAX_DIMENSION = 7680; 

    /**
     * Updates the text content of slider value displays.
     */
    function updateSliderValues() {
        blurValue.textContent = blurSlider.value;
        widthValue.textContent = widthSlider.value;
        amplitudeValue.textContent = amplitudeSlider.value;
        lightingValue.textContent = lightingSlider.value;
    }
    
    /**
     * Draws an image to the preview canvas, scaling it to fit its container safely.
     */
    function drawPreviewImage(img) {
        const container = canvas.parentElement;
        canvas.style.display = 'none';
        const styles = window.getComputedStyle(container);
        const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
        const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

        const availableWidth = container.clientWidth - paddingX;
        const availableHeight = container.clientHeight - paddingY;
        canvas.style.display = '';

        const containerRatio = availableWidth / availableHeight;
        const imgRatio = img.width / img.height;
        let drawWidth, drawHeight;

        if (containerRatio > imgRatio) {
            drawHeight = availableHeight;
            drawWidth = drawHeight * imgRatio;
        } else {
            drawWidth = availableWidth;
            drawHeight = drawWidth / imgRatio;
        }
        
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    
    /**
     * Safely resizes the original image to prevent processing limits.
     */
    function resizeImageForProcessing(img) {
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
                height = Math.floor((height / width) * MAX_DIMENSION);
                width = MAX_DIMENSION;
            } else {
                width = Math.floor((width / height) * MAX_DIMENSION);
                height = MAX_DIMENSION;
            }
        }

        const downscaleCanvas = document.createElement('canvas');
        downscaleCanvas.width = width;
        downscaleCanvas.height = height;
        const downCtx = downscaleCanvas.getContext('2d');
        downCtx.drawImage(img, 0, 0, width, height);
        
        const resizedImage = new Image();
        resizedImage.src = downscaleCanvas.toDataURL('image/png');
        return resizedImage;
    }

    /**
     * Applies all selected visual effects to the original image.
     */
    async function applyEffects() {
        if (!originalImage) return;
        
        loader.classList.remove('hidden');
        loader.classList.add('flex');
        
        // Wait briefly so the browser can repaint the loader UI before locking the main thread
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        // --- Get current values from sliders ---
        const blur = parseFloat(blurSlider.value);
        const reedWidth = parseInt(widthSlider.value);
        const amplitude = parseInt(amplitudeSlider.value);
        const lighting = parseInt(lightingSlider.value);
        
        const finalCanvas = document.createElement('canvas');
        const finalCtx = finalCanvas.getContext('2d');
        finalCanvas.width = originalImage.width;
        finalCanvas.height = originalImage.height;
        
        // --- Apply Blur ---
        if (blur > 0) {
            const blurCanvas = document.createElement('canvas');
            const blurCtx = blurCanvas.getContext('2d');
            const padding = blur * 2;
            blurCanvas.width = originalImage.width + padding * 2;
            blurCanvas.height = originalImage.height + padding * 2;
            
            blurCtx.drawImage(originalImage, padding, padding, originalImage.width, originalImage.height);
            blurCtx.filter = `blur(${blur}px)`;
            blurCtx.drawImage(blurCanvas, 0, 0); 
            blurCtx.filter = 'none';

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
        
        fullResolutionCanvas = finalCanvas;
        drawPreviewImage(fullResolutionCanvas);
        
        loader.classList.add('hidden');
        loader.classList.remove('flex');
    }
    
    /**
     * Applies a vertical reeded glass distortion and a 3D lighting effect.
     */
    function applyDistortionAndLighting(imageData, width, height, reedWidth, amplitude, lighting) {
        const src = imageData.data;
        const dst = new Uint8ClampedArray(src.length);
        const displacement = new Float32Array(width);
        const shading = new Float32Array(width); 

        for (let x = 0; x < width; x++) {
            const angle = 2 * Math.PI * x / reedWidth;
            displacement[x] = amplitude * Math.sin(angle);
            shading[x] = lighting * Math.cos(angle); 
        }
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = Math.round(x + displacement[x]);
                const clampedX = Math.max(0, Math.min(width - 1, srcX));
                
                const dstIdx = (y * width + x) * 4;
                const srcIdx = (y * width + clampedX) * 4;
                
                const brightnessChange = shading[x];

                dst[dstIdx]     = src[srcIdx]     + brightnessChange; // R
                dst[dstIdx + 1] = src[srcIdx + 1] + brightnessChange; // G
                dst[dstIdx + 2] = src[srcIdx + 2] + brightnessChange; // B
                dst[dstIdx + 3] = src[srcIdx + 3];                    // Alpha
            }
        }
        
        return new ImageData(dst, width, height);
    }
    
    // --- Event Listeners ---
    [blurSlider, widthSlider, amplitudeSlider, lightingSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            updateSliderValues();
            if (originalImage) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => requestAnimationFrame(applyEffects), 100);
            }
        });
    });
    
    // File input listener
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const rawImg = new Image();
                rawImg.onload = () => {
                    // Pre-process downscale to avoid OOM errors
                    originalImage = resizeImageForProcessing(rawImg);
                    originalImage.onload = () => {
                        uploadPromptContainer.style.display = 'none';
                        applyEffects();
                        downloadBtn.disabled = false;
                    }
                };
                rawImg.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = ''; // Reset input
    });
    
    // Download button
    downloadBtn.addEventListener('click', () => {
        if (!fullResolutionCanvas) return;
        const link = document.createElement('a');
        link.download = `nothing-glass-${Date.now()}.png`;
        link.href = fullResolutionCanvas.toDataURL('image/png');
        link.click();
    });
    
    // Resize handler
    window.addEventListener('resize', () => {
        if (fullResolutionCanvas) {
            drawPreviewImage(fullResolutionCanvas);
        }
    });
    
    // Initialize
    updateSliderValues();
});
