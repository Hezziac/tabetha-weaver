// rewriter.js
/**
 * Rewriter API abstraction
 * This function is injected into page context via chrome.scripting.executeScript
 * to avoid CSP violations. All Rewriter API calls happen here.
 */

/**
 * Main rewriter function - executed in page context
 * @param {string} textToRewrite - The selected text to rewrite
 * @param {string} tone - One of: 'simplify', 'formal', 'casual', 'deredundify'
 * @param {string} pageTitle - Context about where the text came from
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} The rewritten text
 */
export async function executeRewrite(textToRewrite, tone, pageTitle, debug) {
    try {
        if (debug) {
            console.log("🤖 [Rewriter]: Creating rewriter with tone:", tone);
            console.log("📏 [Rewriter]: Input text length:", textToRewrite.length);
        }

        console.log("📝 Rewriter API loaded. Processing your text...");

        // Map our tone names to Rewriter API configurations per docs
        const toneConfig = {
            'simplify': {
                tone: 'more-casual',
                format: 'plain-text',
                length: 'as-is',
                sharedContext: 'Rewrite this text using simpler words and concepts that a 5-year-old could understand. Avoid jargon and complex terms. Make it clear and easy to read.'
            },
            'formal': {
                tone: 'more-formal',
                format: 'plain-text',
                length: 'as-is',
                sharedContext: 'Rewrite this text in a professional, formal tone suitable for business or academic communication. Use proper grammar and sophisticated vocabulary where appropriate.'
            },
            'casual': {
                tone: 'more-casual',
                format: 'plain-text',
                length: 'as-is',
                sharedContext: 'Rewrite this text in a casual, friendly tone suitable for social media or informal communication. Make it conversational and approachable.'
            },
            'deredundify': {
                tone: 'as-is',
                format: 'plain-text',
                length: 'shorter',
                sharedContext: 'Remove redundancies and unnecessary words while keeping all important information. Make the text more concise and direct without losing meaning.'
            }
        };

        const config = toneConfig[tone] || toneConfig['simplify'];

        // --- STEP 1: Check API Availability ---
        const availability = await Rewriter.availability({
            tone: config.tone,
            format: config.format,
            length: config.length
        });

        if (debug) {
            console.log("🔍 [Rewriter]: API availability:", availability);
        }

        if (availability === 'unavailable') {
            throw new Error('Rewriter API is not available in your browser. Please update Chrome or enable AI features.');
        }

        // Notify user if download is needed
        if (availability === 'downloadable' || availability === 'downloading') {
            console.log("📥 Rewriter model needs to be downloaded. This may take a moment...");
        }

        // --- STEP 2: Create Rewriter Session ---
        const rewriter = await Rewriter.create({
            tone: config.tone,
            format: config.format,
            length: config.length,
            sharedContext: config.sharedContext,
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    const percent = Math.round(e.loaded * 100);
                    console.log(`📥 Loading Rewriter Model: ${percent}%`);
                    if (debug) {
                        console.log(`📊 [Rewriter]: Download progress - ${percent}%`);
                    }
                });
            }
        });

        if (debug) {
            console.log("✅ [Rewriter]: Session created successfully");
        }

        // --- STEP 3: Check Input Size ---
        const usage = await rewriter.measureInputUsage(textToRewrite);
        const quota = rewriter.inputQuota;

        if (debug) {
            console.log(`📏 [Rewriter]: Token usage: ${usage} / ${quota === Infinity ? '∞' : quota}`);
        }

        if (quota !== Infinity && usage > quota) {
            const overagePercent = Math.round((usage / quota - 1) * 100);
            rewriter.destroy();
            throw new Error(`Text too long! Exceeds limit by ${overagePercent}%. Please select less text.`);
        }

        // --- STEP 4: Perform Rewrite ---
        console.log("🤖 Tabetha is rewriting your text...");
        
        const rewrittenText = await rewriter.rewrite(textToRewrite, {
            context: `Rewrite this text from: "${pageTitle || 'Web page content'}"`
        });

        // --- STEP 5: Cleanup ---
        rewriter.destroy();

        if (debug) {
            console.log("✅ [Rewriter]: Rewrite complete");
            console.log(`📊 [Rewriter]: ${textToRewrite.length} chars → ${rewrittenText.length} chars`);
        }

        console.log("✅ Text successfully rewritten!");

        return rewrittenText;

    } catch (e) {
        // Handle quota exceeded errors specifically
        if (e.name === "QuotaExceededError") {
            const overagePercent = Math.round((e.requested / e.quota - 1) * 100);
            console.error(`❌ Input too large! Text uses ${e.requested} tokens, but only ${e.quota} are available.`);
            throw new Error(`Text too long! Exceeds limit by ${overagePercent}%. Please select less text.`);
        }

        console.error("❌ [Rewriter]: Error:", e.message);
        throw e;
    }
}

// Export the function string for injection
export function getRewriterFunction() {
    return executeRewrite.toString();
}