// popup.js - COMPLETE POPUP WITHOUT PROOFREADER

document.addEventListener('DOMContentLoaded', async () => {

    
    // UI elements
    const summarizeBtn = document.getElementById('summarize-btn');
    const groupTabsBtn = document.getElementById('group-tabs-btn');
    const outputDiv = document.getElementById('output');
    const saniLenSelect = document.getElementById('summary-length-select');
    const generateAltBtn = document.getElementById('generate-alt-btn');
    const pasteSummarizeBtn = document.getElementById('paste-summarize-btn');
    const submitPastedBtn = document.getElementById('submit-pasted-btn');
    const pasteTextarea = document.getElementById('paste-textarea');
    const promptInput = document.getElementById('prompt-input');
    const sendBtn = document.getElementById('send-prompt-btn');
    const logElement = document.getElementById('output-log');
    const debugToggle = document.getElementById('debug-mode');
    const clearLogBtn = document.getElementById('clear-log-btn');
    const rewriteTextBtn = document.getElementById('rewrite-text-btn');
    
    // Writer UI elements
    const writerModeBtn = document.getElementById('writer-mode-btn');
    const writerSection = document.getElementById('writer-section');
    const writeTextBtn = document.getElementById('write-text-btn');
    const writerInstructions = document.getElementById('writer-instructions');
    
    // settings button
    const settingsBtn = document.getElementById('settings-btn');

    // Writer mode state
    let isWriterModeActive = false;

    // SETTINGS BUTTON
    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Initial state
    clearLogBtn.style.display = logElement.textContent.trim().length === 0 ? 'none' : 'inline-block';

    // CLEAR LOG BUTTON
    clearLogBtn.addEventListener('click', () => {
        logElement.textContent = '';
        clearLogBtn.style.display = 'none';
    });

    // Load saved settings
    const { 
        summarizerType = 'teaser',
        summaryLength = 'short',
        debugMode: savedDebugMode = false
    } = await chrome.storage.local.get(['summarizerType', 'summaryLength', 'debugMode']);
    
    saniLenSelect.value = summaryLength;
    debugToggle.checked = savedDebugMode;

    // Append to log (respects debug mode)
    const appendToLog = (text, forceShow = false) => {
        if (forceShow || debugToggle.checked) {
            logElement.textContent += `\n> ${text}`;
            logElement.scrollTop = logElement.scrollHeight;
            clearLogBtn.style.display = 'inline-block';
        }
    };

    // DEBUG MODE TOGGLE
    debugToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ debugMode: e.target.checked });
        appendToLog(`🔧 Debug Mode: ${e.target.checked ? 'ENABLED' : 'DISABLED'}`, true);

        if (!e.target.checked && logElement.textContent.trim().length === 0) {
            clearLogBtn.style.display = 'none';
        }
    });

    // Save summary length
    saniLenSelect.addEventListener('change', () => {
        chrome.storage.local.set({ summaryLength: saniLenSelect.value });
        appendToLog(`📏 Summary Length set to: ${saniLenSelect.value}`);
    });

    // Show current settings
    const typeLabels = {
        'key-points': 'Key Points',
        'tldr': 'TL;DR',
        'teaser': 'Teaser',
        'headline': 'Headline'
    };
    appendToLog(`📝 Summarizer Type: ${typeLabels[summarizerType]}`, true);
    appendToLog(`📏 Default Summary Length: ${summaryLength}`, true);

    // Cleanup stale data
    const cleanupStaleImageData = async () => {
        const { pending_image_data } = await chrome.storage.local.get('pending_image_data');
        if (pending_image_data && pending_image_data.timestamp) {
            const ageInMinutes = (Date.now() - pending_image_data.timestamp) / (1000 * 60);
            if (ageInMinutes > 5) {
                await chrome.storage.local.remove('pending_image_data');
                appendToLog('🧹 Cleaned up stale image data');
                return true;
            }
        }
        return false;
    };

    const wasStale = await cleanupStaleImageData();

    // Chat input handlers
    promptInput.addEventListener('input', () => {
        sendBtn.classList.toggle('visible', promptInput.value.trim().length > 0);
    });

    promptInput.addEventListener('focus', () => {
        if (promptInput.value.trim().length > 0) {
            sendBtn.classList.add('visible');
        }
    });

    promptInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!sendBtn.matches(':hover') && document.activeElement !== promptInput) {
                sendBtn.classList.remove('visible');
            }
        }, 200);
    });

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (promptInput.value.trim()) sendBtn.click();
        }
    });

    sendBtn.addEventListener('click', async () => {
        const userPrompt = promptInput.value.trim();
        if (!userPrompt) return;
        
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        outputDiv.innerText = '🤔 Tabetha is thinking...';
        appendToLog(`💬 User asked: "${userPrompt.substring(0, 50)}..."`);

        try {
            chrome.runtime.sendMessage({
                action: "chat_with_tabetha",
                prompt: userPrompt
            });
        } catch (e) {
            console.error("❌ Error sending chat message:", e);
            outputDiv.innerText = `❌ Error: ${e.message}`;
            appendToLog(`❌ Error: ${e.message}`);
        }
        
        promptInput.value = '';
        sendBtn.classList.remove('visible');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    });

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab.url;

    // WRITER MODE TOGGLE
    writerModeBtn.addEventListener('click', async () => {
        isWriterModeActive = !isWriterModeActive;
        
        if (isWriterModeActive) {
            appendToLog('📝 [Writer]: Writer mode activated', true);
            
            await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data']);
            
            writerSection.style.display = 'block';
            writerModeBtn.innerText = '📝';
            writerModeBtn.title = 'Close Writer Mode';
            
            const { pending_writer_data } = await chrome.storage.local.get('pending_writer_data');
            
            if (pending_writer_data && pending_writer_data.referenceText) {
                const preview = pending_writer_data.referenceText.substring(0, 150);
                outputDiv.innerText = `✍️ Writer Mode Active\n\n📄 Reference text:\n"${preview}${pending_writer_data.referenceText.length > 150 ? '...' : ''}"\n\n⬇️ Enter writing instructions below`;
                appendToLog(`📄 [Writer]: Reference text loaded (${pending_writer_data.referenceText.length} chars)`);
            } else {
                outputDiv.innerText = '✍️ Writer Mode Active\n\nEnter your writing instructions below.\n\n💡 Tip: You can write with or without highlighting a reference text first.';
                appendToLog('📝 [Writer]: Standalone mode (no reference text)');
            }
            
            writerInstructions.focus();
            
        } else {
            appendToLog('🔴 [Writer]: Writer mode deactivated', true);
            
            writerSection.style.display = 'none';
            writerModeBtn.innerText = '✍️';
            writerModeBtn.title = 'Toggle Writer Mode';
            
            await chrome.storage.local.remove('pending_writer_data');
            writerInstructions.value = '';
            outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
        }
    });

    // WRITE TEXT BUTTON
    writeTextBtn.addEventListener('click', async () => {
        const instructions = writerInstructions.value.trim();
        
        if (!instructions) {
            outputDiv.innerText = '⚠️ Please enter writing instructions first!';
            appendToLog('⚠️ [Writer]: User attempted to write without instructions');
            return;
        }
        
        await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data']);
        
        writeTextBtn.disabled = true;
        writeTextBtn.textContent = '⏳ Writing...';
        outputDiv.innerText = '✍️ Tabetha is writing new content...';
        appendToLog('⏳ [Writer]: Starting write...', true);
        appendToLog(`📝 Instructions: "${instructions.substring(0, 100)}${instructions.length > 100 ? '...' : ''}"`);
        
        const { pending_writer_data } = await chrome.storage.local.get('pending_writer_data');
        
        chrome.runtime.sendMessage({
            action: "write_text",
            writingTask: instructions,
            referenceText: pending_writer_data?.referenceText || '',
            pageTitle: pending_writer_data?.pageTitle || '',
            tabId: tab.id
        });
        
        setTimeout(() => {
            writeTextBtn.disabled = false;
            writeTextBtn.textContent = '✍️ Generate New Writing';
        }, 1000);
        
        writerInstructions.value = '';
    });

    // REWRITE TEXT BUTTON
    rewriteTextBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove(['pending_image_data', 'pending_writer_data']);
        
        rewriteTextBtn.disabled = true;
        rewriteTextBtn.textContent = '⏳ Rewriting...';
        outputDiv.innerText = '✏️ Tabetha is rewriting your text...';
        appendToLog('⏳ [Text Rewriter]: Starting rewrite...', true);
        
        chrome.runtime.sendMessage({
            action: "rewrite_text",
            tabId: tab.id
        });
    });

    // GENERATE ALT TEXT BUTTON
    generateAltBtn.addEventListener('click', async () => {
        generateAltBtn.disabled = true;
        generateAltBtn.textContent = '⏳ Generating...';
        outputDiv.innerText = '🧠 Tabetha is analyzing the image...';
        appendToLog('⏳ [Image Alt-Text]: Starting generation...', true);
        
        chrome.runtime.sendMessage({
            action: "generate_alt_text",
            tabId: tab.id
        });
    });

    // Helper to clear element
    const clearElement = (element) => {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    };

    // Check pending image
    const checkPendingImage = async () => {
        const data = await chrome.storage.local.get('pending_image_data');
        if (!data.pending_image_data) return false;

        const imgData = data.pending_image_data;

        if (imgData.error && imgData.failedAt) {
            outputDiv.innerText = `❌ Error: ${imgData.error}`;
            generateAltBtn.style.display = 'none';
            appendToLog(`❌ [Image Alt-Text]: ${imgData.error}`);
            
            setTimeout(async () => {
                await chrome.storage.local.remove('pending_image_data');
                appendToLog('🧹 Cleared error state');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
            }, 5000);
            return true;
        }

        if (imgData.altTextGenerated) {
            clearElement(outputDiv);
            
            outputDiv.innerText = `✅ Alt Text Generated:\n\n"${imgData.altTextGenerated}"`;
            
            appendToLog('✅ [Image Alt-Text]: Completed', true);
            appendToLog(`🖼️ Image URL: ${imgData.imageUrl.substring(0, 100)}...`);
            generateAltBtn.style.display = 'none';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.marginTop = '15px';
            
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 Copy Alt Text';
            copyBtn.style.marginRight = '10px';
            copyBtn.className = 'action-button';
            copyBtn.onclick = async () => {
                await navigator.clipboard.writeText(imgData.altTextGenerated);
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Alt Text';
                }, 2000);
            };
            buttonContainer.appendChild(copyBtn);
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '🧹 Clear';
            clearBtn.className = 'action-button';
            clearBtn.onclick = async () => {
                await chrome.storage.local.remove('pending_image_data');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                appendToLog('🧹 Cleared alt text result');
            };
            buttonContainer.appendChild(clearBtn);
            
            outputDiv.appendChild(buttonContainer);
            
            return true;
        } else {
            generateAltBtn.style.display = 'block';
            generateAltBtn.disabled = false;
            generateAltBtn.textContent = '🖼️ Generate Alt Text';
            
            outputDiv.innerText = `🖼️ Image ready for alt text generation\n\n⬇️ Click button below to generate ⬇️`;
            
            appendToLog('📸 [Image]: Ready to generate alt text');
            if (debugToggle.checked && imgData.imageUrl) {
                if (imgData.imageUrl.startsWith('data:')) {
                    appendToLog('🔗 Image Type: Base64 Data URL');
                } else {
                    appendToLog(`🔗 Image URL: ${imgData.imageUrl.substring(0, 100)}...`);
                }
            }
            return true;
        }
    };

    // Check pending rewrite
    const checkPendingRewrite = async () => {
        const data = await chrome.storage.local.get('pending_rewrite_data');
        if (!data.pending_rewrite_data) return false;

        const rewriteData = data.pending_rewrite_data;

        if (rewriteData.error && rewriteData.failedAt) {
            outputDiv.innerText = `❌ Error: ${rewriteData.error}`;
            rewriteTextBtn.style.display = 'none';
            appendToLog(`❌ [Text Rewriter]: ${rewriteData.error}`);
            
            setTimeout(async () => {
                await chrome.storage.local.remove('pending_rewrite_data');
                appendToLog('🧹 Cleared error state');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
            }, 5000);
            return true;
        }

        if (rewriteData.rewrittenText) {
            clearElement(outputDiv);
            
            const toneLabels = {
                'simplify': 'Simplified (ELI5)',
                'formal': 'Formalized (Professional)',
                'casual': 'Casualized (Friendly)',
                'deredundify': 'De-redundified (Concise)'
            };
            
            const toneLabel = toneLabels[rewriteData.tone] || 'Rewritten';
            
            outputDiv.innerText = `✅ Text ${toneLabel}:\n\n"${rewriteData.rewrittenText}"`;
            
            appendToLog(`✅ [Text Rewriter]: Completed with tone: ${rewriteData.tone}`, true);
            rewriteTextBtn.style.display = 'none';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.marginTop = '15px';
            
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 Copy Rewritten Text';
            copyBtn.style.marginRight = '10px';
            copyBtn.className = 'action-button';
            copyBtn.onclick = async () => {
                await navigator.clipboard.writeText(rewriteData.rewrittenText);
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Rewritten Text';
                }, 2000);
            };
            buttonContainer.appendChild(copyBtn);
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '🧹 Clear';
            clearBtn.className = 'action-button';
            clearBtn.onclick = async () => {
                await chrome.storage.local.remove('pending_rewrite_data');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                appendToLog('🧹 Cleared rewritten text');
            };
            buttonContainer.appendChild(clearBtn);
            
            outputDiv.appendChild(buttonContainer);
            
            return true;
        } else {
            rewriteTextBtn.style.display = 'block';
            rewriteTextBtn.disabled = false;
            
            const toneEmojis = {
                'simplify': '🧒',
                'formal': '💼',
                'casual': '😊',
                'deredundify': '✂️'
            };
            
            const toneNames = {
                'simplify': 'Simplify',
                'formal': 'Make Formal',
                'casual': 'Make Casual',
                'deredundify': 'De-Redundify'
            };
            
            const emoji = toneEmojis[rewriteData.tone] || '✏️';
            const toneName = toneNames[rewriteData.tone] || 'Rewrite';
            
            rewriteTextBtn.textContent = `${emoji} ${toneName} Text`;
            
            const preview = rewriteData.selectedText.substring(0, 100);
            outputDiv.innerText = `📄 Selected text preview:\n"${preview}${rewriteData.selectedText.length > 100 ? '...' : ''}"\n\n⬇️ Click button below to ${toneName.toLowerCase()} ⬇️`;
            
            appendToLog(`📝 [Text Rewriter]: Ready to ${toneName.toLowerCase()}`);
            appendToLog(`📏 Text length: ${rewriteData.selectedText.length} characters`);
            
            return true;
        }
    };

    // Check pending writer
    const checkPendingWriter = async () => {
        const data = await chrome.storage.local.get('pending_writer_data');
        if (!data.pending_writer_data) return false;

        const writerData = data.pending_writer_data;

        if (writerData.error && writerData.failedAt) {
            outputDiv.innerText = `❌ Error: ${writerData.error}`;
            writerSection.style.display = 'none';
            isWriterModeActive = false;
            writerModeBtn.innerText = '✍️';
            appendToLog(`❌ [Writer]: ${writerData.error}`);
            
            setTimeout(async () => {
                await chrome.storage.local.remove('pending_writer_data');
                appendToLog('🧹 Cleared error state');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
            }, 5000);
            return true;
        }

        if (writerData.writtenText) {
            clearElement(outputDiv);
            
            outputDiv.innerText = `✅ New Content Written:\n\n${writerData.writtenText}`;
            
            appendToLog('✅ [Writer]: Completed', true);
            appendToLog(`📝 Task: "${writerData.writingTask}"`);
            
            writerSection.style.display = 'none';
            isWriterModeActive = false;
            writerModeBtn.innerText = '✍️';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.marginTop = '15px';
            
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 Copy Written Text';
            copyBtn.style.marginRight = '10px';
            copyBtn.className = 'action-button';
            copyBtn.onclick = async () => {
                await navigator.clipboard.writeText(writerData.writtenText);
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Written Text';
                }, 2000);
            };
            buttonContainer.appendChild(copyBtn);
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '🧹 Clear';
            clearBtn.className = 'action-button';
            clearBtn.onclick = async () => {
                await chrome.storage.local.remove('pending_writer_data');
                outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                appendToLog('🧹 Cleared written text');
            };
            buttonContainer.appendChild(clearBtn);
            
            outputDiv.appendChild(buttonContainer);
            
            return true;
        } else if (writerData.referenceText) {
            writerSection.style.display = 'block';
            isWriterModeActive = true;
            writerModeBtn.innerText = '📝';
            
            const preview = writerData.referenceText.substring(0, 150);
            outputDiv.innerText = `✍️ Reference text:\n"${preview}${writerData.referenceText.length > 150 ? '...' : ''}"\n\n⬇️ Enter writing instructions below ⬇️`;
            
            appendToLog('📝 [Writer]: Ready to write new content');
            appendToLog(`📏 Reference text length: ${writerData.referenceText.length} characters`);
            
            return true;
        }

        return false;
    };

    // Check tab grouping results
    const checkTabGroupingResults = async () => {
        const data = await chrome.storage.local.get('tab_grouping_status');
        if (!data.tab_grouping_status) return false;

        const status = data.tab_grouping_status;

        // Show recent status (within last 30 seconds)
        const age = Date.now() - (status.timestamp || 0);
        if (age > 30000) {
            await chrome.storage.local.remove('tab_grouping_status');
            return false;
        }

        if (status.status === 'complete') {
            outputDiv.innerText = status.message;
            appendToLog('✅ [Tab Grouping]: Completed', true);
            appendToLog(`📊 Created ${status.groupCount} groups`);
            
            setTimeout(async () => {
                await chrome.storage.local.remove('tab_grouping_status');
            }, 5000);
            
            return true;
        } else if (status.status === 'error') {
            outputDiv.innerText = `❌ Error: ${status.message}`;
            appendToLog(`❌ [Tab Grouping]: ${status.message}`);
            
            setTimeout(async () => {
                await chrome.storage.local.remove('tab_grouping_status');
            }, 5000);
            
            return true;
        } else if (status.status === 'analyzing' || status.status === 'grouping') {
            outputDiv.innerText = status.message || '🤖 AI is analyzing...';
            return true;
        }

        return false;
    };

        // Initialize UI
    const updateUI = async () => {
        const hasGrouping = await checkTabGroupingResults();
        if (hasGrouping) return;

        const hasWriter = await checkPendingWriter();
        if (hasWriter) return;

        const hasRewrite = await checkPendingRewrite();
        if (hasRewrite) return;

        if (!wasStale) {
            const hasImage = await checkPendingImage();
            if (hasImage) return;
        }

        // 📍 CHECK FOR PASTED TEXT SUMMARY FIRST
        const pastedData = await chrome.storage.local.get('pasted_text_status');
        if (pastedData['pasted_text_status'] && !outputDiv.innerText.includes('🖼️')) {
            const data = pastedData['pasted_text_status'];
            
            if (data.status === 'complete' && data.summary) {
                clearElement(outputDiv);
                
                outputDiv.innerText = data.summary;
                appendToLog(`✅ [Pasted Summary]: Completed`);
                
                // 📍 ADD BUTTONS FOR PASTED SUMMARY
                const buttonContainer = document.createElement('div');
                buttonContainer.style.marginTop = '15px';
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = '📋 Copy Summary';
                copyBtn.style.marginRight = '10px';
                copyBtn.className = 'action-button';
                copyBtn.onclick = async () => {
                    await navigator.clipboard.writeText(data.summary);
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy Summary';
                    }, 2000);
                };
                buttonContainer.appendChild(copyBtn);
                
                const clearBtn = document.createElement('button');
                clearBtn.textContent = '🧹 Clear';
                clearBtn.className = 'action-button';
                clearBtn.onclick = async () => {
                    await chrome.storage.local.remove('pasted_text_status');
                    outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                    appendToLog('🧹 Cleared summary');
                };
                buttonContainer.appendChild(clearBtn);
                
                outputDiv.appendChild(buttonContainer);
                return;
            } else if (data.status === 'pending') {
                outputDiv.innerText = '⏳ Tabetha is still working on that summary...';
                appendToLog(`⏳ [Pasted Summary]: In progress...`);
                return;
            } else if (data.status === 'error') {
                outputDiv.innerText = `❌ Error: ${data.message || 'Unknown error'}`;
                appendToLog(`❌ [Pasted Summary]: ${data.message}`);
                return;
            }
        }

        // 📍 THEN CHECK PAGE SUMMARY
        const storedData = await chrome.storage.local.get(tabUrl);
        const data = storedData[tabUrl];

        if (data && !outputDiv.innerText.includes('🖼️')) {
            if (data.status === 'complete' && data.summary) {
                clearElement(outputDiv);
                
                outputDiv.innerText = data.summary;
                appendToLog(`✅ [Page Summary]: Completed`);
                
                // 📍 ADD BUTTONS FOR PAGE SUMMARY
                const buttonContainer = document.createElement('div');
                buttonContainer.style.marginTop = '15px';
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = '📋 Copy Summary';
                copyBtn.style.marginRight = '10px';
                copyBtn.className = 'action-button';
                copyBtn.onclick = async () => {
                    await navigator.clipboard.writeText(data.summary);
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy Summary';
                    }, 2000);
                };
                buttonContainer.appendChild(copyBtn);
                
                const clearBtn = document.createElement('button');
                clearBtn.textContent = '🧹 Clear';
                clearBtn.className = 'action-button';
                clearBtn.onclick = async () => {
                    await chrome.storage.local.remove(tabUrl);
                    outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                    appendToLog('🧹 Cleared summary');
                };
                buttonContainer.appendChild(clearBtn);
                
                outputDiv.appendChild(buttonContainer);
                
            } else if (data.status === 'pending') {
                outputDiv.innerText = '⏳ Tabetha is still working on that summary...';
                appendToLog(`⏳ [Page Summary]: In progress...`);
            } else if (data.status === 'error') {
                outputDiv.innerText = `❌ Error: ${data.message || 'Unknown error'}`;
                appendToLog(`❌ [Page Summary]: ${data.message}`);
            }
        } else if (!data && !outputDiv.innerText.includes('🖼️') && !outputDiv.innerText.includes('Error')) {
            outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
        }
    };

    updateUI();

    // Summarize This Page
    summarizeBtn.addEventListener('click', () => {
        const saniLen = saniLenSelect.value;
        chrome.storage.local.set({ [tabUrl]: { status: 'pending' } });

        outputDiv.innerText = '📊 Gathering your summary...';
        appendToLog(`⏳ Starting ${saniLen} page summary...`, true);

        chrome.runtime.sendMessage({
            action: "start_summarization",
            tabId: tab.id,
            url: tabUrl,
            length: saniLen
        });
    });

    // Toggle Pasted Text
    pasteSummarizeBtn.addEventListener('click', () => {
        const isHidden = pasteTextarea.style.display === 'none';
        pasteTextarea.style.display = isHidden ? 'block' : 'none';
        submitPastedBtn.style.display = isHidden ? 'block' : 'none';
        if (isHidden) pasteTextarea.focus();
    });

    // Submit Pasted Text
    submitPastedBtn.addEventListener('click', () => {
        const pastedText = pasteTextarea.value.trim();
        const saniLen = saniLenSelect.value;

        if (!pastedText) {
            outputDiv.innerText = `⚠️ Please paste some text first!`;
            appendToLog(`⚠️ User attempted to submit empty pasted text.`);
            return;
        }

        const pasteKey = 'pasted_text_status';
        chrome.storage.local.set({ [pasteKey]: { status: 'pending' } });

        outputDiv.innerText = '📝 Summarizing your pasted text...';
        appendToLog(`⏳ Starting ${saniLen} summary of pasted text (${pastedText.length} chars)...`, true);

        chrome.runtime.sendMessage({
            action: "summarize_paste",
            text: pastedText,
            length: saniLen,
            url: pasteKey
        });

        pasteTextarea.style.display = 'none';
        submitPastedBtn.style.display = 'none';
        pasteTextarea.value = '';
    });

    // Group Tabs Button
    groupTabsBtn.addEventListener('click', async () => {
        try {
            groupTabsBtn.disabled = true;
            groupTabsBtn.textContent = '⏳ Analyzing...';

            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!currentTab || !currentTab.windowId) {
                outputDiv.innerText = '❌ Could not detect window.';
                groupTabsBtn.disabled = false;
                groupTabsBtn.textContent = '📂 Group All Tabs';
                return;
            }

            outputDiv.innerText = '🧠 Analyzing tabs...';
            appendToLog(`⏳ [Tab Grouping]: Starting...`, true);

            // Send request to background
            chrome.runtime.sendMessage({ 
                action: "group_tabs"
            });

            // Wait for preview
            const checkInterval = setInterval(async () => {
                const { tab_grouping_status, tab_grouping_preview } = await chrome.storage.local.get(['tab_grouping_status', 'tab_grouping_preview']);
                
                if (!tab_grouping_status) return;

                if (tab_grouping_status.status === 'preview' && tab_grouping_preview) {
                    clearInterval(checkInterval);
                    showGroupPreview(tab_grouping_preview.groups);
                    groupTabsBtn.disabled = false;
                    groupTabsBtn.textContent = '📂 Group All Tabs';
                    appendToLog(`📊 [Tab Grouping]: Preview ready - ${Object.keys(tab_grouping_preview.groups).length} groups`, true);
                    return;
                }

                if (tab_grouping_status.status === 'complete' || tab_grouping_status.status === 'error') {
                    clearInterval(checkInterval);
                    groupTabsBtn.disabled = false;
                    groupTabsBtn.textContent = '📂 Group All Tabs';

                    if (tab_grouping_status.status === 'complete') {
                        outputDiv.innerText = tab_grouping_status.message;
                        appendToLog('✅ [Tab Grouping]: Complete', true);
                    } else {
                        outputDiv.innerText = `❌ Error: ${tab_grouping_status.message}`;
                        appendToLog(`❌ [Tab Grouping]: ${tab_grouping_status.message}`);
                    }

                    setTimeout(async () => {
                        await chrome.storage.local.remove('tab_grouping_status');
                    }, 3000);
                }
            }, 300);

            // Timeout fallback
            setTimeout(() => {
                clearInterval(checkInterval);
                groupTabsBtn.disabled = false;
                groupTabsBtn.textContent = '📂 Group All Tabs';
            }, 60000);

        } catch (e) {
            console.error("❌ Error:", e);
            outputDiv.innerText = `❌ Error: ${e.message}`;
            appendToLog(`❌ Error: ${e.message}`);
            groupTabsBtn.disabled = false;
            groupTabsBtn.textContent = '📂 Group All Tabs';
        }
    });

    // ✅ Confirm and create groups
    async function confirmAndCreateGroups() {
        document.getElementById('group-preview-section').style.display = 'none';
        outputDiv.innerText = '🎨 Creating your groups...';
        appendToLog('✅ User confirmed - creating groups...', true);

        chrome.runtime.sendMessage({ 
            action: "create_groups_confirmed"
        });
    }

    // ✅ Cancel grouping
    async function cancelGrouping() {
        await chrome.storage.local.remove(['tab_grouping_preview', 'tab_grouping_status']);
        document.getElementById('group-preview-section').style.display = 'none';
        outputDiv.innerText = '👋 Grouping cancelled';
        appendToLog('🛑 User cancelled grouping', true);
        
        setTimeout(() => {
            outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
        }, 2000);
    }

    function showGroupPreview(groups) {
        const previewSection = document.getElementById('group-preview-section');
        const groupList = document.getElementById('group-preview-list');
        const countLabel = document.getElementById('group-count-label');

        // ✅ FIX: Check if groupList exists first
        if (!groupList) {
            console.error("❌ group-preview-list element not found in DOM");
            outputDiv.innerText = "❌ Error: Preview element not found";
            return;
        }

        // ✅ SAFELY clear the list
        while (groupList.firstChild) {
            groupList.removeChild(groupList.firstChild);
        }

        let totalTabs = 0;
        const groupArray = Object.entries(groups);
        
        for (const [domain, data] of groupArray) {
            totalTabs += data.count;
            
            // ✅ Create item using createElement (safe, no innerHTML)
            const item = document.createElement('div');
            item.className = 'group-preview-item';
            
            // Create content container
            const contentDiv = document.createElement('div');
            contentDiv.className = 'group-preview-content';
            
            // Create domain name element
            const domainDiv = document.createElement('div');
            domainDiv.className = 'group-domain';
            domainDiv.innerText = `🌐 ${domain}`;
            
            // Create count element
            const countDiv = document.createElement('div');
            countDiv.className = 'group-count';
            const tabWord = data.count !== 1 ? 'tabs' : 'tab';
            countDiv.innerText = `${data.count} ${tabWord}`;
            
            // Append to content
            contentDiv.appendChild(domainDiv);
            contentDiv.appendChild(countDiv);
            
            // Append to item
            item.appendChild(contentDiv);
            
            // Add to list
            groupList.appendChild(item);
        }

        // ✅ Update summary using innerText
        if (countLabel) {
            countLabel.innerText = `📊 ${Object.keys(groups).length} groups • ${totalTabs} tabs`;
        }
        
        previewSection.style.display = 'block';
        outputDiv.innerText = '🎨 Ready to organize your tabs?';

        // ✅ Set up ONLY Cancel and Group buttons (NO regenerate)
        const confirmBtn = document.getElementById('confirm-groups-btn');
        const cancelBtn = document.getElementById('cancel-groups-btn');
        
        if (confirmBtn) {
            confirmBtn.onclick = confirmAndCreateGroups;
        }
        if (cancelBtn) {
            cancelBtn.onclick = cancelGrouping;
        }
}

// ✅ Confirm and create groups
async function confirmAndCreateGroups() {
    const previewSection = document.getElementById('group-preview-section');
    if (previewSection) {
        previewSection.style.display = 'none';
    }
    outputDiv.innerText = '🎨 Creating your groups...';
    appendToLog('✅ User confirmed - creating groups...', true);

    chrome.runtime.sendMessage({ 
        action: "create_groups_confirmed"
    });
}

// ✅ Cancel grouping
async function cancelGrouping() {
    await chrome.storage.local.remove(['tab_grouping_preview', 'tab_grouping_status']);
    const previewSection = document.getElementById('group-preview-section');
    if (previewSection) {
        previewSection.style.display = 'none';
    }
    outputDiv.innerText = '👋 Grouping cancelled';
    appendToLog('🛑 User cancelled grouping', true);
    
    setTimeout(() => {
        outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
    }, 2000);
}

    // ✅ NEW: Confirm and create groups
    async function confirmAndCreateGroups() {
        document.getElementById('group-preview-section').style.display = 'none';
        outputDiv.innerText = '🎨 Creating your groups...';
        appendToLog('✅ User confirmed - creating groups...', true);

        chrome.runtime.sendMessage({ 
            action: "create_groups_confirmed"
        });
    }

    // ✅ NEW: Cancel grouping
    async function cancelGrouping() {
        await chrome.storage.local.remove(['tab_grouping_preview', 'tab_grouping_status']);
        document.getElementById('group-preview-section').style.display = 'none';
        outputDiv.innerText = '👋 Grouping cancelled';
        appendToLog('🛑 User cancelled grouping', true);
        
        setTimeout(() => {
            outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
        }, 2000);
    }


    // Listen for Storage Changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        const tabDataChange = changes[tabUrl];
        const pasteDataChange = changes['pasted_text_status'];
        const chatDataChange = changes['chat_response_status'];
        const pendingImageChange = changes['pending_image_data'];
        const pendingRewriteChange = changes['pending_rewrite_data'];
        const pendingWriterChange = changes['pending_writer_data'];
        const groupingStatusChange = changes['tab_grouping_status'];
        
        // Handle grouping status updates
        if (groupingStatusChange?.newValue) {
            updateUI();
            return;
        }

        if (pendingImageChange?.newValue || pendingRewriteChange?.newValue || pendingWriterChange?.newValue) {
            updateUI();
            return;
        }

        const data = tabDataChange?.newValue || pasteDataChange?.newValue || chatDataChange?.newValue;
        if (!data) return;

        let prefix;
        let isSummary = false;
        
        if (tabDataChange) {
            prefix = 'Page Summary';
            isSummary = true;
        } else if (pasteDataChange) {
            prefix = 'Pasted Summary';
            isSummary = true;
        } else if (chatDataChange) {
            prefix = 'Chat Response';
        }

        if (data.status === 'complete') {
            clearElement(outputDiv);
            
            outputDiv.innerText = data.summary;
            appendToLog(`✅ [${prefix}]: Completed`, true);
            
            if (chatDataChange && data.prompt) {
                appendToLog(`🗨️ Prompt: "${data.prompt.substring(0, 60)}..."`);
            }
            
            // 📍 ADD BUTTONS FOR BOTH SUMMARIES
            if (isSummary) {
                const buttonContainer = document.createElement('div');
                buttonContainer.style.marginTop = '15px';
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = '📋 Copy Summary';
                copyBtn.style.marginRight = '10px';
                copyBtn.className = 'action-button';
                copyBtn.onclick = async () => {
                    await navigator.clipboard.writeText(data.summary);
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy Summary';
                    }, 2000);
                };
                buttonContainer.appendChild(copyBtn);
                
                const clearBtn = document.createElement('button');
                clearBtn.textContent = '🧹 Clear';
                clearBtn.className = 'action-button';
                clearBtn.onclick = async () => {
                    if (tabDataChange) {
                        await chrome.storage.local.remove(tabUrl);
                    } else if (pasteDataChange) {
                        await chrome.storage.local.remove('pasted_text_status');
                    }
                    outputDiv.innerText = '👋 Hi there! I\'m Tabetha. How can I help you today?';
                    appendToLog('🧹 Cleared summary');
                };
                buttonContainer.appendChild(clearBtn);
                
                outputDiv.appendChild(buttonContainer);
            }
            
        } else if (data.status === 'error') {
            outputDiv.innerText = `❌ Error: ${data.message}`;
            appendToLog(`❌ [${prefix}]: ${data.message}`);
        }
    });
    
});