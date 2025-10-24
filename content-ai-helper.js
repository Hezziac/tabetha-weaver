// content-ai-helper.js
// Runs in content script context (has user gesture)

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'execute_ai_naming') {
    try {
      const { urlGroups, debugMode } = request;

      if (debugMode) {
        console.log("🤖 [DEBUG][AI Content]: Starting naming in content script");
        console.log(`📊 [DEBUG][AI]: ${Object.keys(urlGroups).length} domain groups to name`);
      }

      const domainDescriptions = Object.entries(urlGroups)
        .map(([domain, tabIds]) => `${domain} (${tabIds.length} tabs)`)
        .join('\n');

      const prompt = `You are Tabetha Weaver, expert at naming browser tab groups.

Provide creative, meaningful names for these domain-based tab groups:

${domainDescriptions}

INSTRUCTIONS:

Output ONE group name per line
Format: DOMAIN|GROUP_NAME
Replace DOMAIN with the exact domain from above
Replace GROUP_NAME with a short, meaningful category (max 25 chars)
Examples:
github.com|Coding & Dev
youtube.com|Video Content
twitter.com|Social Networks
amazon.com|Shopping
Be creative but concise
Return ONLY the naming output (DOMAIN|GROUP_NAME per line), NO explanations
Start:`;

      if (debugMode) {
        console.log("📤 [DEBUG][AI Content]: Checking availability...");
      }

      const availability = await LanguageModel.availability();

      if (debugMode) {
        console.log(`🔍 [DEBUG][AI Content]: Availability: ${availability}`);
      }

      if (availability === "no") {
        throw new Error("AI model not available on this system.");
      }

      if (debugMode) {
        console.log("🤖 [DEBUG][AI Content]: Creating session...");
      }

      const session = await LanguageModel.create({
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const percent = Math.round(e.loaded * 100);
            if (debugMode) {
              console.log(`📥 [DEBUG][AI Content]: Download: ${percent}%`);
            }
            console.log(`📥 Model: ${percent}%`);
          });
        }
      });

      if (debugMode) {
        console.log("✅ [DEBUG][AI Content]: Session ready");
        console.log("🤖 AI naming groups...");
      }


      const params = await LanguageModel.params();

      const aiResponse = await session.prompt(prompt, {
        temperature: Math.min(0.5, params.maxTemperature),
        topK: Math.min(30, params.maxTopK)
      });

      if (debugMode) {
        console.log("📥 [DEBUG][AI Content]: Raw response received");
        console.log(`📄 [DEBUG][AI Content]: Full response:\n${aiResponse}`);
      }

      session.destroy();

      // Parse response: DOMAIN|GROUP_NAME format
      const namedGroups = {};
      const lines = aiResponse.trim().split('\n');

      if (debugMode) {
        console.log(`📋 [DEBUG][AI Content]: Processing ${lines.length} response lines`);
      }

      for (const line of lines) {
        const trimmed = String(line || '').trim();
        
        if (!trimmed) continue;
        
        if (!trimmed.includes('|')) {
          if (debugMode) {
            console.log(`⏭️ [DEBUG][AI Content]: Skipping non-format line: "${String(trimmed).substring(0, 50)}"`);
          }
          continue;
        }

        const parts = trimmed.split('|');
        if (parts.length < 2) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG][AI Content]: Invalid format (expected 2+ parts): "${trimmed}"`);
          }
          continue;
        }

        const domainRaw = String(parts[0] || '').trim().toLowerCase();
        const groupNameRaw = parts.slice(1).join('|').trim();

        if (!domainRaw || !groupNameRaw) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG][AI Content]: Empty domain or name in: "${trimmed}"`);
          }
          continue;
        }

        if (!urlGroups[domainRaw]) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG][AI Content]: Domain "${domainRaw}" not found in groups`);
          }
          continue;
        }

        const groupName = String(groupNameRaw || '')
          .replace(/[^a-zA-Z0-9\s&-]/g, '')
          .trim()
          .substring(0, 50);

        if (groupName.length < 2) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG][AI Content]: Group name too short after normalization: "${groupName}"`);
          }
          continue;
        }

        namedGroups[groupName] = urlGroups[domainRaw];

        if (debugMode) {
          console.log(`✅ [DEBUG][AI Content]: Named "${domainRaw}" as "${groupName}"`);
        }
      }

      if (Object.keys(namedGroups).length === 0) {
        throw new Error("No valid group names created from AI response.");
      }

      if (debugMode) {
        console.log(`✅ [DEBUG][AI Content]: ${Object.keys(namedGroups).length} final named groups`);
        Object.entries(namedGroups).forEach(([name, ids]) => {
          console.log(`  📌 "${name}": ${ids.length} tabs`);
        });
        console.log("✅ AI naming complete");
      }

      sendResponse({ namedGroups, error: null });

    } catch (e) {
      console.error("❌ [AI Naming in Content Script]:", e.message);

      const { debugMode } = request;
      if (debugMode) {
        console.error("❌ [DEBUG][AI Content]:", e);
      }

      sendResponse({
        namedGroups: null,
        error: e.message || "AI naming failed"
      });
    }
  }
});