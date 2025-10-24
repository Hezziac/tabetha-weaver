// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const saveButton = document.getElementById('save-options');
    const statusDisplay = document.getElementById('status');

    // Default settings (removed rewriterTone)
    const defaults = {
        summarizerType: 'teaser',
        summaryLength: 'short'
    };

    // Load saved settings
    const savedData = await chrome.storage.local.get([
        'summarizerType', 
        'summaryLength'
    ]);
    
    const summarizerType = savedData.summarizerType || defaults.summarizerType;
    const summaryLength = savedData.summaryLength || defaults.summaryLength;
    
    // Set summarizer radio buttons
    document.querySelectorAll('input[name="summarizerType"]').forEach(radio => {
        if (radio.value === summarizerType) {
            radio.checked = true;
        }
    });
    
    document.querySelectorAll('input[name="summaryLength"]').forEach(radio => {
        if (radio.value === summaryLength) {
            radio.checked = true;
        }
    });

    // Save settings
    saveButton.addEventListener('click', async () => {
        const selectedType = document.querySelector('input[name="summarizerType"]:checked')?.value || 'teaser';
        const selectedLength = document.querySelector('input[name="summaryLength"]:checked')?.value || 'short';
        
        try {
            await chrome.storage.local.set({ 
                summarizerType: selectedType,
                summaryLength: selectedLength
            });
            
            statusDisplay.textContent = '✅ Settings saved successfully!';
            statusDisplay.className = 'success';
            
            setTimeout(() => {
                statusDisplay.textContent = '';
                statusDisplay.className = '';
            }, 3000);
        } catch (error) {
            statusDisplay.textContent = '❌ Error saving settings';
            statusDisplay.className = 'error';
        }
    });
});