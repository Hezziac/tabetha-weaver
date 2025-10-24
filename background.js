// background.js

import { groupTabs } from './tabs.js';
import { chatWithTabetha } from './chatWithTabetha.js';
import { executeRewrite } from './rewriter.js';
import { executeWrite } from './writer.js';

// --- CREATE CONTEXT MENUS ON INSTALL ---
chrome.runtime.onInstalled.addListener(async () => {
    // Image alt-text context menu
    chrome.contextMenus.create({
        id: "tabetha-alt-imager",
        title: "🔍 Generate Alt Text with Tabetha",
        contexts: ["image"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    // ========== TABETHA WEAVER REWRITING SUBMENU ==========
    chrome.contextMenus.create({
        id: "tabetha-rewriting-parent",
        title: "Tabetha Weaver Rewriting",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    chrome.contextMenus.create({
        id: "tabetha-rewriter-simplify",
        parentId: "tabetha-rewriting-parent",
        title: "🧒 Simplify (ELI5)",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    chrome.contextMenus.create({
        id: "tabetha-rewriter-formal",
        parentId: "tabetha-rewriting-parent",
        title: "💼 Make Formal",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    chrome.contextMenus.create({
        id: "tabetha-rewriter-casual",
        parentId: "tabetha-rewriting-parent",
        title: "😊 Make Casual",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    chrome.contextMenus.create({
        id: "tabetha-rewriter-deredundify",
        parentId: "tabetha-rewriting-parent",
        title: "✂️ De-Redundify",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });

    // ========== TABETHA WEAVER WRITING SUBMENU ==========
    chrome.contextMenus.create({
        id: "tabetha-writing-parent",
        title: "Tabetha Weaver Writing",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
    
    chrome.contextMenus.create({
        id: "tabetha-writer-draft",
        parentId: "tabetha-writing-parent",
        title: "✍️ Write Draft",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });

    const defaults = {
        summarizerType: 'teaser',
        summaryLength: 'medium',
        debugMode: false
    };

    const currentPrefs = await chrome.storage.local.get(['summarizerType', 'summaryLength', 'debugMode']);
    const prefsToSet = {};
    for (const key in defaults) {
        if (currentPrefs[key] === undefined) {
            prefsToSet[key] = defaults[key];
        }
    }

    if (Object.keys(prefsToSet).length > 0) {
        await chrome.storage.local.set(prefsToSet);
        console.log("✅ Initialized default preferences:", prefsToSet);
    }

    await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data', 'pending_writer_data']);
    console.log("🧹 Cleaned up stale pending data on install");
});

// --- HANDLE CONTEXT MENU CLICK ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const { debugMode } = await chrome.storage.local.get('debugMode');
    
    // Handle image alt-text generation
    if (info.menuItemId === "tabetha-alt-imager" && info.srcUrl) {
        if (debugMode) {
            console.log("✅ [Context Menu]: Image alt-text clicked");
        }
        
        try {
            await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data', 'pending_writer_data']);
            
            await chrome.storage.local.set({
                pending_image_data: {
                    imageUrl: info.srcUrl,
                    tabId: tab.id,
                    pageUrl: tab.url,
                    pageTitle: tab.title,
                    existingAlt: info.altText || '',
                    timestamp: Date.now()
                }
            });
            
            if (debugMode) {
                console.log("✅ [Context Menu]: Image data stored");
            }
            
            chrome.action.openPopup().catch(() => {
                if (debugMode) {
                    console.log("ℹ️ [Context Menu]: Popup auto-open blocked");
                }
            });
            
        } catch (e) {
            console.error("❌ [Context Menu]: Error:", e);
        }
    }
    
    // Handle text rewriting
    const rewriterMenuIds = {
        "tabetha-rewriter-simplify": "simplify",
        "tabetha-rewriter-formal": "formal",
        "tabetha-rewriter-casual": "casual",
        "tabetha-rewriter-deredundify": "deredundify"
    };
    
    if (rewriterMenuIds[info.menuItemId] && info.selectionText) {
        const tone = rewriterMenuIds[info.menuItemId];
        
        if (debugMode) {
            console.log(`✅ [Context Menu]: Rewriter clicked - ${tone}`);
        }

        try {
            await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data', 'pending_writer_data']);

            await chrome.storage.local.set({
                pending_rewrite_data: {
                    selectedText: info.selectionText,
                    tone: tone,
                    pageUrl: tab.url,
                    pageTitle: tab.title,
                    timestamp: Date.now()
                }
            });

            if (debugMode) {
                console.log("✅ [Context Menu]: Text data stored with tone:", tone);
            }

            chrome.action.openPopup().catch(() => {
                if (debugMode) {
                    console.log("ℹ️ [Context Menu]: Popup auto-open blocked");
                }
            });
        } catch (e) {
            console.error("❌ [Context Menu]: Error:", e);    
        }
    }

    // Handle Writer API
    if (info.menuItemId === "tabetha-writer-draft" && info.selectionText) {
        if (debugMode) {
            console.log("✅ [Context Menu]: Writer clicked");
        }

        try {
            await chrome.storage.local.remove(['pending_image_data', 'pending_rewrite_data', 'pending_writer_data']);

            await chrome.storage.local.set({
                pending_writer_data: {
                    referenceText: info.selectionText,
                    pageUrl: tab.url,
                    pageTitle: tab.title,
                    timestamp: Date.now()
                }
            });

            if (debugMode) {
                console.log("✅ [Context Menu]: Writer data stored");
            }

            chrome.action.openPopup().catch(() => {
                if (debugMode) {
                    console.log("ℹ️ [Context Menu]: Popup auto-open blocked");
                }
            });
        } catch (e) {
            console.error("❌ [Context Menu]: Error:", e);
        }
    }
});

// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "group_tabs") {
        (async () => {
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                
                if (debugMode) {
                    console.log("📤 [DEBUG][Background]: group_tabs request received");
                }

                const response = await groupTabs();
                
                if (debugMode) {
                    console.log(`✅ [DEBUG][Background]: Response status: ${response.status}`);
                }
                
            } catch (error) {
                console.error("❌ [Background]: Error:", error.message);
                
                const { debugMode } = await chrome.storage.local.get('debugMode');
                if (debugMode) {
                    console.error("❌ [DEBUG][Background]:", error);
                }
                
                await chrome.storage.local.set({
                    tab_grouping_status: {
                        status: 'error',
                        message: error.message || 'Unknown error',
                        timestamp: Date.now()
                    }
                });
            }
        })();
        return true;

    } else if (request.action === "start_summarization") {
        (async () => {
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
                if (!tab || !tab.id) throw new Error('Tab not found.');

                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (debug) => {
                        const mainContentElement = document.querySelector('article') ||
                                     document.querySelector('main') ||
                                     document.querySelector('[role="main"]') ||
                                     document.body;
                                     
                        let rawText = '';
                        
                        if (mainContentElement) {
                            const pTags = mainContentElement.querySelectorAll('p');
                            if (pTags.length > 0) {
                                rawText = Array.from(pTags).map(p => p.innerText).join('\n');
                            } else {
                                rawText = mainContentElement.innerText;
                            }
                        } else {
                            const pTags = document.body.querySelectorAll('p');
                            if (pTags.length > 0) {
                                rawText = Array.from(pTags).map(p => p.innerText).join('\n');
                            } else {
                                rawText = document.body.innerText;
                            }
                        }
                        
                        const sanitizeText = (text) => {
                            if (!text) return '';
                            let cleanText = text.replace(/```math.*?```/g, '');
                            cleanText = cleanText.replace(/\s+/g, ' ').trim();
                            return cleanText;
                        };
                        
                        const sanitized = sanitizeText(rawText);
                        if (debug) {
                            console.log("📏 Sanitized text length:", sanitized.length);
                        }
                        return sanitized;
                    },
                    args: [debugMode]
                });

                let pageContent = result.result;
                
                if (debugMode) {
                    console.log("📤 Content length being sent:", pageContent ? pageContent.length : "0");
                }
                
                if (!pageContent || pageContent.length === 0) {
                    throw new Error('No content found to summarize.');
                }

                const APPROX_TOKENS = Math.ceil(pageContent.length / 4);
                const MAX_TOKENS_SAFE = 6000;

                if (APPROX_TOKENS > MAX_TOKENS_SAFE) {
                    console.warn(`⚠️ Content too long (~${APPROX_TOKENS} tokens). Truncating.`);
                    const TRUNCATE_LIMIT = 24000;
                    if (pageContent.length > TRUNCATE_LIMIT) {
                        const start = pageContent.substring(0, 20000);
                        const end = pageContent.substring(pageContent.length - 4000);
                        pageContent = `${start}\n\n[…TRUNCATED…]\n\n${end}`;
                    }
                }

                const [finalSummary] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async (text, saniLen, debug) => {
                        try {
                            if (text.length > 32000) text = text.substring(0, 32000);
                            
                            const { summarizerType = 'teaser' } = await chrome.storage.local.get('summarizerType');

                            const summarizer = await Summarizer.create({
                                type: summarizerType,
                                length: saniLen,
                                outputLanguage: "en"
                            });
                            
                            const summary = await summarizer.summarize(text, {
                                context: "This is a blog post or news article. Provide a Brief BUT DETAILED summary.",
                            });
                            
                            if (debug) console.log("✅ Summarizer result received");
                            return summary;
                        } catch (e) {
                            if (e.name === "QuotaExceededError") {
                                console.error(`Input too large! Requested ${e.requested}, available ${e.quota}`);
                            }
                            throw e;
                        }
                    },
                    args: [pageContent, request.length, debugMode]
                });

                if (debugMode) {
                    console.log("📝 Final summary result ready");
                }

                if (finalSummary.result) {
                    chrome.storage.local.set({
                        [request.url]: { status: 'complete', summary: finalSummary.result }
                    });
                    if (debugMode) console.log('✅ Summarization complete');
                } else {
                    throw new Error('Tabetha couldn\'t produce a summary.');
                }
            } catch (e) {
                console.error('❌ Error in summarization:', e.message);
                chrome.storage.local.set({
                    [request.url]: { status: 'error', message: e.message }
                });
            }
        })();
        return true;

    } else if (request.action === "generate_alt_text") {
        (async () => {
            let pendingImageData;
            
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                const result = await chrome.storage.local.get('pending_image_data');
                pendingImageData = result.pending_image_data;
                
                if (!pendingImageData) {
                    throw new Error("No image data found. Please right-click an image first.");
                }

                if (debugMode) {
                    console.log("🖼️ Generating alt text");
                }

                console.log("⏳ Analyzing image for alt text generation...");

                let validTab;
                try {
                    validTab = await chrome.tabs.get(pendingImageData.tabId);
                } catch (e) {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!activeTab) {
                        throw new Error("No active tab found");
                    }
                    validTab = activeTab;
                    pendingImageData.tabId = activeTab.id;
                }

                const [imageResult] = await chrome.scripting.executeScript({
                    target: { tabId: validTab.id },
                    func: async (imageUrl, debug) => {
                        if (debug) console.log("📥 Fetching image");
                        
                        try {
                            const response = await fetch(imageUrl);
                            const blob = await response.blob();
                            
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve({
                                    success: true,
                                    dataUrl: reader.result
                                });
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            const img = document.querySelector(`img[src="${imageUrl}"]`);
                            
                            if (!img) return { success: false, error: "Image not found" };
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width;
                            canvas.height = img.naturalHeight || img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            
                            return { 
                                success: true, 
                                dataUrl: canvas.toDataURL('image/jpeg', 0.9)
                            };
                        }
                    },
                    args: [pendingImageData.imageUrl, debugMode]
                });
                
                if (!imageResult.result?.success) {
                    throw new Error("Could not load image");
                }
                
                if (debugMode) {
                    console.log("✅ Image loaded successfully");
                }
                
                console.log("🤖 Processing image with AI...");
                
                const base64Data = imageResult.result.dataUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteArray = new Uint8Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteArray[i] = byteCharacters.charCodeAt(i);
                }
                const imageBlob = new Blob([byteArray], { type: 'image/jpeg' });
                const imageFile = new File([imageBlob], 'image.jpg', { type: 'image/jpeg' });
                
                if (debugMode) console.log("🤖 Creating AI session...");
                
                const session = await LanguageModel.create({
                    expectedInputs: [
                        { type: "text", languages: ["en"] },
                        { type: "image" }
                    ],
                    expectedOutputs: [
                        { type: "text", languages: ["en"] }
                    ],
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const percent = Math.round(e.loaded * 100);
                            if (debugMode) console.log(`📥 Download: ${percent}%`);
                        });
                    }
                });
                
                if (debugMode) console.log("🧠 Analyzing image...");
                
                const systemPrompt = `You are an SEO and accessibility expert.
                  Describe EXACTLY what you see in the image.
                  STRICT RULES:
                  1. Describe ONLY visible content
                  2. Be specific: breeds, colors, positions, objects
                  3. NO promotional text
                  4. NEVER mention things not visible
                  5. Keep under 125 characters
                  6. Do NOT start with "Image of"
                  7. Return ONLY the alt text`;

                const aiResponse = await session.prompt([
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: [
                            { type: "text", value: "Generate accurate SEO alt text describing exactly what you see." },
                            { type: "image", value: imageFile }
                        ]
                    }
                ], {
                    temperature: 0.3,
                    topK: 40
                });
                
                if (debugMode) console.log("✅ AI Response received");
                
                let cleanedAlt = aiResponse.trim()
                    .replace(/^["']|["']$/g, '')
                    .replace(/^Alt text:\s*/i, '')
                    .replace(/^\*\*.*?\*\*\s*/, '');

                const badPhrases = [
                    /\.\s*Discover.*/i,
                    /\.\s*Perfect for.*/i,
                    /\.\s*Ideal for.*/i,
                    /\.\s*Learn about.*/i
                ];
                
                for (const phrase of badPhrases) {
                    cleanedAlt = cleanedAlt.replace(phrase, '');
                }

                await chrome.storage.local.set({
                    pending_image_data: {
                        ...pendingImageData,
                        altTextGenerated: cleanedAlt,
                        analyzedAt: Date.now()
                    }
                });

                if (debugMode) console.log("✅ Alt text generated");
                console.log("✅ Alt text generated successfully");

                session.destroy();

            } catch (e) {
                console.error("❌ Error generating alt text:", e.message);
                
                if (pendingImageData) {
                    await chrome.storage.local.set({
                        pending_image_data: {
                            ...pendingImageData,
                            error: e.message || 'Failed to generate alt text',
                            failedAt: Date.now()
                        }
                    });
                } else {
                    await chrome.storage.local.set({
                        pending_image_data: {
                            error: e.message || 'No image selected',
                            failedAt: Date.now()
                        }
                    });
                }
            }
        })();
        return true;

    } else if (request.action === "summarize_paste") {
        (async () => {
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                const textToSummarize = request.text;
                const requestedLength = request.length;
                const storageKey = request.url;

                if (!textToSummarize || textToSummarize.length === 0) {
                    throw new Error('No text provided.');
                }

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                    throw new Error('Active tab not found.');
                }

                if (debugMode) {
                    console.log("📤 Pasted text length:", textToSummarize.length);
                }

                const [finalSummary] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async (text, saniLen, debug) => {
                        try {
                            const APPROX_TOKENS = Math.ceil(text.length / 4);
                            const MAX_TOKENS_SAFE = 6000;

                            if (APPROX_TOKENS > MAX_TOKENS_SAFE) {
                                throw new Error(`Content too long (~${APPROX_TOKENS} tokens)`);
                            }

                            const { summarizerType = 'teaser' } = await chrome.storage.local.get('summarizerType');

                            const summarizer = await Summarizer.create({
                                type: summarizerType,
                                length: saniLen,
                                outputLanguage: "en"
                            });

                            const summary = await summarizer.summarize(text, {
                                context: "This is user-pasted text. Provide a concise detailed summary.",
                            });

                            if (debug) {
                                console.log("✅ Pasted text summarizer result");
                            }
                            return summary;
                        } catch (e) {
                            throw e;
                        }
                    },
                    args: [textToSummarize, requestedLength, debugMode]
                });

                if (finalSummary.result) {
                    chrome.storage.local.set({
                        [storageKey]: { status: 'complete', summary: finalSummary.result }
                    });
                    if (debugMode) {
                        console.log('✅ Pasted text summarization complete');
                    }
                } else {
                    throw new Error('Failed to produce summary.');
                }
            } catch (e) {
                console.error('❌ Error in paste summarization:', e.message);
                chrome.storage.local.set({
                    [request.url]: { status: 'error', message: e.message }
                });
            }
        })();
        return true;

    } else if (request.action === "chat_with_tabetha") {
        (async () => {
            const userPrompt = request.prompt;
            const storageKey = "chat_response_status";

            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');

                chrome.storage.local.set({
                    [storageKey]: { status: 'pending' }
                });

                const aiResponse = await chatWithTabetha(userPrompt, debugMode);

                chrome.storage.local.set({
                    [storageKey]: {
                        status: 'complete',
                        summary: aiResponse,
                        prompt: userPrompt
                    }
                });

            } catch (e) {
                console.error("❌ Error in chat:", e.message);
                chrome.storage.local.set({
                    [storageKey]: {
                        status: 'error',
                        message: e.message || 'Unknown error'
                    }
                });
            }
        })();
        return true;
        
    } else if (request.action === "rewrite_text") {
        (async () => {
            let pendingRewriteData;
            
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                
                const existingData = await chrome.storage.local.get('pending_rewrite_data');
                if (existingData.pending_rewrite_data?.rewrittenText) {
                    return;
                }
                
                const result = await chrome.storage.local.get('pending_rewrite_data');
                pendingRewriteData = result.pending_rewrite_data;
                
                if (!pendingRewriteData) {
                    throw new Error("No text selected.");
                }

                const tone = pendingRewriteData.tone;
                
                if (debugMode) {
                    console.log(`✏️ [Rewriter]: Starting with tone: ${tone}`);
                }

                console.log("⏳ Rewriter API loaded. Processing text...");

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                    throw new Error('No active tab found.');
                }

                const [rewriteResult] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: executeRewrite,
                    args: [
                        pendingRewriteData.selectedText,
                        tone,
                        pendingRewriteData.pageTitle,
                        debugMode
                    ]
                });

                if (!rewriteResult?.result) {
                    throw new Error('Failed to rewrite text.');
                }

                await chrome.storage.local.set({
                    pending_rewrite_data: {
                        ...pendingRewriteData,
                        rewrittenText: rewriteResult.result,
                        rewrittenAt: Date.now()
                    }
                });

                if (debugMode) {
                    console.log("✅ [Rewriter]: Completed");
                }

                console.log("✅ Rewriter text loaded");

            } catch (e) {
                console.error("❌ [Rewriter]: Error:", e.message);
                
                if (pendingRewriteData) {
                    await chrome.storage.local.set({
                        pending_rewrite_data: {
                            ...pendingRewriteData,
                            error: e.message || 'Failed to rewrite',
                            failedAt: Date.now()
                        }
                    });
                } else {
                    await chrome.storage.local.set({
                        pending_rewrite_data: {
                            error: e.message || 'No text selected',
                            failedAt: Date.now()
                        }
                    });
                }
            }
        })();
        return true;
        
    } else if (request.action === "write_text") {
        (async () => {
            try {
                const { debugMode } = await chrome.storage.local.get('debugMode');
                
                const writingTask = request.writingTask;
                const referenceText = request.referenceText || '';
                const pageTitle = request.pageTitle || '';
                
                if (!writingTask || writingTask.trim().length === 0) {
                    throw new Error("Please provide writing instructions.");
                }
                
                if (debugMode) {
                    console.log("✍️ [Writer]: Starting write");
                }

                console.log("⏳ Writer API loaded. Creating new content...");

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                    throw new Error('No active tab found.');
                }

                const [writeResult] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: executeWrite,
                    args: [
                        writingTask,
                        referenceText,
                        pageTitle,
                        debugMode
                    ]
                });

                if (!writeResult?.result) {
                    throw new Error('Failed to write text.');
                }

                await chrome.storage.local.set({
                    pending_writer_data: {
                        writtenText: writeResult.result,
                        writingTask: writingTask,
                        referenceText: referenceText,
                        pageTitle: pageTitle,
                        writtenAt: Date.now()
                    }
                });

                if (debugMode) {
                    console.log("✅ [Writer]: Completed");
                }
                
                console.log("✅ Writer text loaded");

            } catch (e) {
                console.error("❌ [Writer]: Error:", e.message);
                
                await chrome.storage.local.set({
                    pending_writer_data: {
                        error: e.message || 'Failed to write',
                        failedAt: Date.now()
                    }
                });
            }
        })();
        return true;
    }
});