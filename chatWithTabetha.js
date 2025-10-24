// chatWithTabetha.js

export async function chatWithTabetha(promptText, debugMode = false) {
    if (!promptText?.trim()) {
        throw new Error("No prompt provided.");
    }

    try {
        // --- STEP 1: Check Model Availability ---
        let availability;
        try {
            availability = await LanguageModel.availability();
        } catch (e) {
            throw new Error("AI model not available. Update Chrome or enable flags.");
        }

        if (availability === "no") {
            throw new Error("AI model not supported on this device.");
        }

        if (debugMode) {
            console.log("🧠 LanguageModel available:", availability);
        }

        if (availability === "downloadable") {
            if (debugMode) console.log("⏬ Downloading AI model...");
        }

        // --- STEP 2: Create Session ---
        let session;
        try {
            session = await LanguageModel.create({
                monitor(monitor) {
                    monitor.addEventListener("downloadprogress", (event) => {
                        if (debugMode) {
                            console.log(`📥 Download: ${(event.loaded * 100).toFixed(1)}%`);
                        }
                    });
                }
            });
        } catch (e) {
            throw new Error("Could not start AI session. Try again later.");
        }

        // --- STEP 3: Build System Prompt ---
        const systemContext = `
            You are "Tabetha Weaver", a helpful, detailed, concise, and friendly browser AI assistant.
            Answer the user's question clearly and directly.
            If you don't know something, say so — don't make things up.
            Keep responses under 3-4 sentences unless asked for more.
            Use bullet points '•' or numbered lists if it helps clarity.

            If asked to group tabs say: "I can do that if you press the 'Group All Tabs' button in the Tabetha Weaver popup extension, as you have that ability.
            
            Always have a little humor and emojis.
        `.trim();

        // --- STEP 4: Send Prompt ---
        let aiResponse;
        try {
            aiResponse = await session.prompt([
                { role: "system", content: systemContext },
                { role: "user", content: promptText }
            ], {
                temperature: 0.7,
                topK: 40
            });

            if (debugMode) {
                console.log("✅ Raw AI Response:", aiResponse);
            }

            return aiResponse.trim();

        } catch (e) {
            console.error("❌ Prompt API error:", e);
            throw new Error(`AI failed to respond: ${e.message}`);
        }

    } catch (e) {
        console.error("💥 Error in chatWithTabetha:", e);
        throw e;
    }
}