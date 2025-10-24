// writer.js
/**
 * Writer API abstraction
 * This function is injected into page context via chrome.scripting.executeScript
 * to avoid CSP violations. All Writer API calls happen here.
 */

/**
 * Main writer function - executed in page context
 * @param {string} writingTask - What the user wants written
 * @param {string} referenceText - Optional context/reference text (can be empty)
 * @param {string} pageTitle - Context about where this is from
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} The generated text
 */
export async function executeWrite(writingTask, referenceText, pageTitle, debug) {
    try {
        if (debug) {
            console.log("📝 Writer API loaded. Creating your content...");
            console.log("📝 [Writer]: Task:", writingTask);
            console.log("📄 [Writer]: Reference text length:", referenceText?.length || 0);
        }


        // --- STEP 1: Check API Availability ---
        const availability = await Writer.availability();

        if (debug) {
            console.log("🔍 [Writer]: API availability:", availability);
        }

        if (availability === 'unavailable') {
            throw new Error('Writer API is not available in your browser. Please update Chrome or enable AI features.');
        }

        // Notify user if download is needed
        if (availability === 'downloadable' || availability === 'downloading') {
            console.log("📥 Writer model needs to be downloaded. This may take a moment...");
        }

        // --- STEP 2: Build Context ---
        let sharedContext = `You are a professional writer helping create content.`;
        
        if (pageTitle) {
            sharedContext += ` Context: This request is from "${pageTitle}".`;
        }
        
        if (referenceText && referenceText.trim().length > 0) {
            sharedContext += `\n\nReference material provided by user:\n${referenceText}`;
        } else {
            sharedContext += `\n\nNo reference material provided. Generate original content based solely on the user's instructions.`;
        }

        // --- STEP 3: Create Writer Session ---
        const writer = await Writer.create({
            sharedContext: sharedContext,
            tone: 'neutral',
            format: 'plain-text',
            length: 'medium',
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    const percent = Math.round(e.loaded * 100);
                    if (debug) {
                        console.log(`📊 [Writer]: Download progress - ${percent}%`);
                    }
                });
            }
        });

        if (debug) {
            console.log("✅ [Writer]: Session created successfully");
        }

        // --- STEP 4: Measure Input Usage ---
        const usage = await writer.measureInputUsage(writingTask);
        const quota = writer.inputQuota;

        if (debug) {
            console.log(`📏 [Writer]: Token usage: ${usage} / ${quota === Infinity ? '∞' : quota}`);
        }

        if (quota !== Infinity && usage > quota) {
            const overagePercent = Math.round((usage / quota - 1) * 100);
            writer.destroy();
            throw new Error(`Instructions too long! Exceeds limit by ${overagePercent}%. Please shorten your request.`);
        }

        // --- STEP 5: Generate Content ---
        const writtenText = await writer.write(writingTask);

        // --- STEP 6: Cleanup ---
        writer.destroy();

        if (debug) {
            console.log("✅ [Writer]: Write complete");
            console.log(`📊 [Writer]: Generated ${writtenText.length} characters`);
            console.log(`📄 [Writer]: Preview: ${writtenText.substring(0, 100)}...`);
        }

        console.log("✅ Content successfully created!");

        return writtenText;

    } catch (e) {
        // Handle quota exceeded errors specifically
        if (e.name === "QuotaExceededError") {
            const overagePercent = Math.round((e.requested / e.quota - 1) * 100);
            console.error(`❌ Input too large! Uses ${e.requested} tokens, but only ${e.quota} are available.`);
            throw new Error(`Instructions too long! Exceeds limit by ${overagePercent}%. Please shorten your request.`);
        }

        console.error("❌ [Writer]: Error:", e.message);
        throw e;
    }
}

// Export the function string for injection
export function getWriterFunction() {
    return executeWrite.toString();
}