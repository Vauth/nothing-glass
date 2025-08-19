document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('image-upload');
    const fileNameDisplay = document.getElementById('file-name-display');
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loader = document.getElementById('loader');
    const uploadPromptContainer = document.getElementById('upload-prompt-container');
    const downloadBtn = document.getElementById('download-btn');
    const blurSlider = document.getElementById('blur-slider'),
        widthSlider = document.getElementById('width-slider'),
        amplitudeSlider = document.getElementById('amplitude-slider');
    const blurValue = document.getElementById('blur-value'),
        widthValue = document.getElementById('width-value'),
        amplitudeValue = document.getElementById('amplitude-value');
    
    let originalImage = null;
    let fullResolutionCanvas = null; // This will store the full-quality processed image
    
    function updateSliderValues() {
        blurValue.textContent = blurSlider.value;
        widthValue.textContent = widthSlider.value;
        amplitudeValue.textContent = amplitudeSlider.value;
    }
    
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
    
    async function applyEffects() {
        if (!originalImage) return;
        loader.classList.remove('hidden');
        await new Promise(resolve => setTimeout(resolve, 20)); // Allow UI to update
        
        const blur = parseFloat(blurSlider.value);
        const reedWidth = parseInt(widthSlider.value);
        const amplitude = parseInt(amplitudeSlider.value);
        
        // Create a canvas for the final output, at full resolution
        const finalCanvas = document.createElement('canvas');
        const finalCtx = finalCanvas.getContext('2d');
        finalCanvas.width = originalImage.width;
        finalCanvas.height = originalImage.height;
        
        let imageToProcess = originalImage;
        
        // If there's a blur, handle it carefully to avoid transparent edges.
        if (blur > 0) {
            const blurCanvas = document.createElement('canvas');
            const blurCtx = blurCanvas.getContext('2d');
            const padding = blur * 2;
            blurCanvas.width = originalImage.width + padding * 2;
            blurCanvas.height = originalImage.height + padding * 2;
            
            // Draw the image in the center of the padded canvas
            blurCtx.drawImage(originalImage, padding, padding);
            
            // Apply blur to the entire padded canvas
            blurCtx.filter = `blur(${blur}px)`;
            blurCtx.drawImage(blurCanvas, 0, 0);
            blurCtx.filter = 'none';

            // Draw the central, non-bordered part back to the final canvas
            finalCtx.drawImage(blurCanvas, padding, padding, originalImage.width, originalImage.height, 0, 0, originalImage.width, originalImage.height);
        } else {
            finalCtx.drawImage(imageToProcess, 0, 0);
        }
        
        // Now, proceed with distortion on the final canvas.
        if (amplitude > 0 && reedWidth > 0) {
            const baseImageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const distortedImageData = applyDistortion(baseImageData, finalCanvas.width, finalCanvas.height, reedWidth, amplitude);
            finalCtx.putImageData(distortedImageData, 0, 0);
        }
        
        // Store the full-resolution canvas for downloading.
        fullResolutionCanvas = finalCanvas;
        
        // Draw the final result to the visible canvas for preview.
        drawPreviewImage(fullResolutionCanvas);
        loader.classList.add('hidden');
    }
    
    function applyDistortion(imageData, width, height, reedWidth, amplitude) {
        const src = imageData.data;
        const dst = new Uint8ClampedArray(src.length);
        const displacement = new Float32Array(width);
        
        for (let x = 0; x < width; x++) {
            displacement[x] = amplitude * Math.sin(2 * Math.PI * x / reedWidth);
        }
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = Math.round(x + displacement[x]);
                const clampedX = Math.max(0, Math.min(width - 1, srcX));
                const dstIdx = (y * width + x) * 4;
                const srcIdx = (y * width + clampedX) * 4;
                dst[dstIdx] = src[srcIdx];
                dst[dstIdx + 1] = src[srcIdx + 1];
                dst[dstIdx + 2] = src[srcIdx + 2];
                dst[dstIdx + 3] = src[srcIdx + 3];
            }
        }
        
        return new ImageData(dst, width, height);
    }
    
    let debounceTimer;
    [blurSlider, widthSlider, amplitudeSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            updateSliderValues();
            if (originalImage) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => requestAnimationFrame(applyEffects), 50);
            }
        });
    });
    
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
    
    downloadBtn.addEventListener('click', () => {
        if (!fullResolutionCanvas) return; // Use the full-resolution canvas
        const link = document.createElement('a');
        link.download = `glass-effect-${Date.now()}.png`;
        link.href = fullResolutionCanvas.toDataURL('image/png'); // Export full quality
        link.click();
    });
    
    window.addEventListener('resize', () => {
        if (fullResolutionCanvas) {
            // Only redraw the preview, no need to re-process the full image
            drawPreviewImage(fullResolutionCanvas);
        }
    });
    
    updateSliderValues();
});
