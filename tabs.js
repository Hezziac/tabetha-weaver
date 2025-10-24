// ============================================================================
// TABS.JS - URL-BASED GROUPING WITH AI NAMING
// ============================================================================

let activeGroupingController = null;

/**
 * MAIN: Group tabs by URL, then get AI to name the groups
 */
export async function groupTabs() {
  let debugMode = false;
  try {
    try {
      const stored = await chrome.storage.local.get('debugMode');
      debugMode = !!stored.debugMode;
    } catch (e) {
      debugMode = false;
    }

    if (debugMode) {
      console.log("✅ Tab Grouping API loaded");
      console.log("🧠 [DEBUG][Tab Grouping]: Starting...");
    }

    if (activeGroupingController) {
      if (debugMode) {
        console.log("🔄 [DEBUG]: Aborting previous request...");
      }
      console.log("🔄 Cancelling previous request...");
      activeGroupingController.abort();
      activeGroupingController = null;
    }

    activeGroupingController = new AbortController();
    const currentSignal = activeGroupingController.signal;

    // Get current window
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const currentWindow = windows.find(w => w.focused) || windows[0];

    if (!currentWindow) {
      throw new Error("No browser window found.");
    }

    const currentWindowId = currentWindow.id;

    if (debugMode) {
      console.log(`🪟 [DEBUG]: Window ID: ${currentWindowId}`);
    }

    // Update status: ANALYZING
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'analyzing',
        message: '🧠 Analyzing tabs...',
        timestamp: Date.now()
      }
    });

    // Get ungrouped tabs
    const tabs = await chrome.tabs.query({ 
      windowId: currentWindowId,
      pinned: false 
    });

    if (debugMode) {
      console.log(`📊 [DEBUG]: Found ${tabs.length} total tabs`);
    }

    if (currentSignal.aborted) throw new Error("Cancelled");

    // Filter accessible tabs ONLY
    const accessibleTabs = tabs.filter(tab => {
      if (!tab.url || typeof tab.url !== 'string') return false;
      if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false;
      if (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://') || 
          tab.url.startsWith('about:') || tab.url.startsWith('edge://') || tab.url.startsWith('file://')) return false;
      if (tab.discarded || tab.status !== 'complete') return false;
      if (tab.windowId !== currentWindowId) return false;
      return true;
    });

    if (debugMode) {
      console.log(`✅ [DEBUG]: ${accessibleTabs.length} accessible tabs`);
    }

    if (accessibleTabs.length < 2) {
      throw new Error("Need at least 2 accessible tabs.");
    }

    // ========== STEP 1: GROUP BY URL DOMAIN ==========
    if (debugMode) {
      console.log("🔗 [DEBUG]: Starting URL-based grouping...");
    }

    const urlGroups = groupTabsByDomain(accessibleTabs, debugMode);

    if (debugMode) {
      console.log(`📋 [DEBUG]: Created ${Object.keys(urlGroups).length} domain groups`);
      Object.entries(urlGroups).forEach(([domain, tabList]) => {
        console.log(`  🌐 ${domain}: ${tabList.length} tabs`);
      });
    }

    if (currentSignal.aborted) throw new Error("Cancelled");

    // ========== STEP 2: ASK AI TO NAME GROUPS ==========
    if (debugMode) {
      console.log("📤 [DEBUG]: Sending domain groups to AI for naming...");
      console.log("📤 Asking AI for group names...");
    }

    // Get a tab to run AI in
    const targetTab = accessibleTabs[0];
    if (!targetTab || !targetTab.id) {
      throw new Error("No valid tab found.");
    }

    let aiResult;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: executeAINaming,
        args: [urlGroups, debugMode]
      });

      aiResult = result.result;
      
    } catch (e) {
      if (debugMode) {
        console.error("❌ [DEBUG]: AI execution failed:", e);
      }
      throw new Error(`AI naming failed: ${e.message}`);
    }

    if (currentSignal.aborted) throw new Error("Cancelled");

    if (debugMode) {
      console.log("📥 [DEBUG]: AI naming response received");
      console.log("📥 AI naming complete");
    }

    if (aiResult.error) {
      throw new Error(aiResult.error);
    }

    const namedGroups = aiResult.namedGroups;

    if (!namedGroups || Object.keys(namedGroups).length === 0) {
      throw new Error("AI failed to name groups.");
    }

    if (debugMode) {
      console.log(`📋 [DEBUG]: ${Object.keys(namedGroups).length} groups ready to create`);
    }

    // Update status: GROUPING
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'grouping',
        message: '🎨 Creating Groups...',
        groupCount: Object.keys(namedGroups).length,
        timestamp: Date.now()
      }
    });

    // ✅ FIX: Don't wait for popup to close - keep going
    // Remove the 500ms delay entirely

    // ========== STEP 3: CREATE TAB GROUPS ==========
    const colors = ["blue", "red", "green", "yellow", "pink", "purple", "cyan"];
    let colorIndex = 0;
    const report = [];
    const alreadyGroupedIds = new Set();
    const failedGroups = [];

    // Track existing groups - SKIP these tabs
    for (const tab of tabs) {
      if (tab.groupId && tab.groupId > 0) {
        alreadyGroupedIds.add(tab.id);
        if (debugMode) {
          console.log(`ℹ️ [DEBUG]: Tab ${tab.id} already in group ${tab.groupId} (skipping)`);
        }
      }
    }

    if (debugMode) {
      console.log(`ℹ️ [DEBUG]: ${alreadyGroupedIds.size} tabs already in groups (skipping)`);
    }

    // ✅ FIX: Process groups with BETTER error handling
    for (const [groupName, tabIds] of Object.entries(namedGroups)) {
      if (currentSignal.aborted) throw new Error("Cancelled");

      try {
        // Filter out already grouped tabs
        let ungroupedTabIds = tabIds.filter(id => !alreadyGroupedIds.has(id));

        if (ungroupedTabIds.length < 2) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG]: Skipping "${groupName}" - only ${ungroupedTabIds.length} ungrouped tabs`);
          }
          continue;
        }

        // ✅ FIX: Re-validate tabs RIGHT BEFORE grouping
        const validTabIds = [];
        for (const id of ungroupedTabIds) {
          try {
            const tab = await chrome.tabs.get(id);
            
            // ✅ STRICT validation
            if (tab.windowId !== currentWindowId) {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} moved to different window`);
              continue;
            }
            if (tab.pinned) {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} is pinned`);
              continue;
            }
            if (tab.discarded) {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} discarded`);
              continue;
            }
            if (tab.status !== 'complete') {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} not complete (status: ${tab.status})`);
              continue;
            }
            if (tab.groupId && tab.groupId > 0) {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} already grouped`);
              alreadyGroupedIds.add(id);
              continue;
            }
            
            validTabIds.push(id);
          } catch (err) {
            if (debugMode) {
              console.warn(`⚠️ [DEBUG]: Tab ${id} invalid: ${err.message}`);
            }
            // Tab was likely closed - skip it
          }
        }

        if (validTabIds.length < 2) {
          if (debugMode) {
            console.warn(`⚠️ [DEBUG]: "${groupName}" - not enough valid ungrouped tabs after re-validation`);
          }
          failedGroups.push({ name: groupName, reason: 'insufficient_valid_tabs' });
          continue;
        }

        // ✅ FIX: Create group with retry logic
        let groupId;
        try {
          groupId = await chrome.tabs.group({ tabIds: validTabIds });
        } catch (err) {
          if (debugMode) {
            console.error(`❌ [DEBUG]: Failed to create group for "${groupName}": ${err.message}`);
          }
          // Retry once after 100ms
          await new Promise(r => setTimeout(r, 100));
          try {
            groupId = await chrome.tabs.group({ tabIds: validTabIds });
          } catch (retryErr) {
            if (debugMode) {
              console.error(`❌ [DEBUG]: Retry failed for "${groupName}": ${retryErr.message}`);
            }
            failedGroups.push({ name: groupName, reason: retryErr.message });
            continue;
          }
        }

        // ✅ Update group properties
        try {
          await chrome.tabGroups.update(groupId, {
            title: String(groupName || 'Group').substring(0, 50),
            color: colors[colorIndex % colors.length]
          });
        } catch (err) {
          if (debugMode) {
            console.warn(`⚠️ [DEBUG]: Could not update group properties: ${err.message}`);
          }
          // Continue anyway - group was created
        }

        report.push({
          name: groupName,
          tabCount: validTabIds.length,
          tabIds: validTabIds,
          groupId: groupId
        });

        colorIndex++;

        if (debugMode) {
          console.log(`✅ [DEBUG]: Created "${groupName}" (${validTabIds.length} tabs, ID: ${groupId})`);
        }

        // ✅ Shorter delay between groups
        await new Promise(r => setTimeout(r, 25));

      } catch (err) {
        if (debugMode) {
          console.error(`❌ [DEBUG]: Outer error for "${groupName}": ${err.message}`);
        }
        failedGroups.push({ name: groupName, reason: err.message });
        // ✅ Continue to next group instead of breaking
      }
    }

    if (report.length === 0) {
      throw new Error("No groups were successfully created.");
    }

    // Complete
    const summary = report.map(g => `📌 ${g.name} (${g.tabCount} tabs)`).join('\n');
    const failedSummary = failedGroups.length > 0 
      ? `\n\n⚠️ Failed to create ${failedGroups.length} groups\nTry again (if you need)...`
      : '';

    if (debugMode) {
      console.log(`🎉 [DEBUG]: SUCCESS! ${report.length} groups created${failedGroups.length > 0 ? `, ${failedGroups.length} failed` : ''}`);
    }
    console.log(`🎉 Complete! ${report.length} groups created${failedSummary}`);

    // Store result as JSON
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'complete',
        message: `🎉 Created ${report.length} groups:\n\n${summary}${failedSummary}`,
        groupCount: report.length,
        failedCount: failedGroups.length,
        groupDetails: report.map(g => ({
          name: g.name,
          tabCount: g.tabCount
        })),
        timestamp: Date.now()
      }
    });

    activeGroupingController = null;

    return {
      status: "success",
      message: `🎉 Created ${report.length} groups:\n\n${summary}${failedSummary}`,
      details: report,
      failedGroups: failedGroups
    };
  } catch (e) {
    console.error("❌ [Tab Grouping]:", e.message);

    if (debugMode) {
      console.error("❌ [DEBUG]:", e);
    }

    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'error',
        message: e.message || 'Tab grouping failed',
        timestamp: Date.now()
      }
    });

    activeGroupingController = null;

    return {
      status: "error",
      message: e.message || 'Tab grouping failed'
    };
  }
}

/**
 * GROUP TABS BY DOMAIN
 * Simple URL-based grouping (no AI involved)
 */
function groupTabsByDomain(accessibleTabs, debug) {
  const domainMap = {};
  const minGroupSize = 2;

  for (const tab of accessibleTabs) {
    if (!tab.url) continue;

    try {
      const urlObj = new URL(tab.url);
      const domain = urlObj.hostname || 'unknown';

      if (!domainMap[domain]) {
        domainMap[domain] = [];
      }
      domainMap[domain].push(tab);
    } catch (err) {
      if (debug) {
        console.warn(`⚠️ [DEBUG]: Could not parse URL: ${tab.url}`);
      }
    }
  }

  // Filter groups with fewer than minGroupSize tabs
  const result = {};
  for (const [domain, tabList] of Object.entries(domainMap)) {
    if (tabList.length >= minGroupSize) {
      result[domain] = tabList.map(t => t.id);
      if (debug) {
        console.log(`✅ [DEBUG]: Domain group "${domain}": ${tabList.length} tabs`);
      }
    } else {
      if (debug) {
        console.log(`⚠️ [DEBUG]: Excluding domain "${domain}": only ${tabList.length} tab(s)`);
      }
    }
  }

  if (debug) {
    console.log(`📊 [DEBUG]: Final domain groups: ${Object.keys(result).length}`);
  }

  return result;
}

/**
 * AI NAMING - Gets creative names for domain-based groups
 */
async function executeAINaming(urlGroups, debug) {
  try {
    if (debug) {
      console.log("🤖 [DEBUG][AI]: Starting naming in page context");
      console.log(`📊 [DEBUG][AI]: ${Object.keys(urlGroups).length} domain groups to name`);
    }

    // Build prompt with domain groups
    const domainDescriptions = Object.entries(urlGroups)
      .map(([domain, tabIds]) => `${domain} (${tabIds.length} tabs)`)
      .join('\n');

    const prompt = `You are Tabetha Weaver, expert at naming browser tab groups.

Provide creative, meaningful names for these domain-based tab groups:

${domainDescriptions}

INSTRUCTIONS:
1. Output ONE group name per line
2. Format: DOMAIN|GROUP_NAME
3. Replace DOMAIN with the exact domain from above
4. Replace GROUP_NAME with a short, meaningful category (max 25 chars)
5. Examples: 
   - github.com|Coding & Dev
   - youtube.com|Video Content
   - twitter.com|Social Networks
   - amazon.com|Shopping
6. Be creative but concise
7. Return ONLY the naming output (DOMAIN|GROUP_NAME per line), NO explanations

Start:`;

    if (debug) {
      console.log("📤 [DEBUG][AI]: Checking availability...");
    }

    const availability = await LanguageModel.availability();
    
    if (debug) {
      console.log(`🔍 [DEBUG][AI]: Availability: ${availability}`);
    }

    if (availability === "no") {
      throw new Error("AI model not available on this system.");
    }

    if (debug) {
      console.log("🤖 [DEBUG][AI]: Creating session...");
    }

    const session = await LanguageModel.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const percent = Math.round(e.loaded * 100);
          if (debug) {
            console.log(`📥 [DEBUG][AI]: Download: ${percent}%`);
          }
          console.log(`📥 Model: ${percent}%`);
        });
      }
    });

    if (debug) {
      console.log("✅ [DEBUG][AI]: Session ready");
      console.log("🤖 AI naming groups...");
    }


    const params = await LanguageModel.params();

    const aiResponse = await session.prompt(prompt, {
      temperature: Math.min(0.5, params.maxTemperature),
      topK: Math.min(30, params.maxTopK)
    });

    if (debug) {
      console.log("📥 [DEBUG][AI]: Raw response received");
      console.log(`📄 [DEBUG][AI]: Full response:\n${aiResponse}`);
    }

    session.destroy();

    // Parse response: DOMAIN|GROUP_NAME format
    const namedGroups = {};
    const lines = aiResponse.trim().split('\n');

    if (debug) {
      console.log(`📋 [DEBUG][AI]: Processing ${lines.length} response lines`);
    }

    for (const line of lines) {
      const trimmed = String(line || '').trim();
      
      // Skip empty lines
      if (!trimmed) continue;
      
      // Skip lines without pipe
      if (!trimmed.includes('|')) {
        if (debug) {
          console.log(`⏭️ [DEBUG][AI]: Skipping non-format line: "${String(trimmed).substring(0, 50)}"`);
        }
        continue;
      }

      const parts = trimmed.split('|');
      if (parts.length < 2) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Invalid format (expected 2+ parts): "${trimmed}"`);
        }
        continue;
      }

      const domainRaw = String(parts[0] || '').trim().toLowerCase();
      // join the rest in case the group name contains pipes
      const groupNameRaw = parts.slice(1).join('|').trim();

      // Validate inputs
      if (!domainRaw || !groupNameRaw) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Empty domain or name in: "${trimmed}"`);
        }
        continue;
      }

      // Check if domain exists in urlGroups
      if (!urlGroups[domainRaw]) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Domain "${domainRaw}" not found in groups`);
        }
        continue;
      }

    // Normalize group name (defensive)
    const groupName = String(groupNameRaw || '')
      .replace(/[^a-zA-Z0-9\s&-]/g, '') // Remove special chars
      .trim()
      .substring(0, 50);

      if (groupName.length < 2) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Group name too short after normalization: "${groupName}"`);
        }
        continue;
      }

      // Use group name as key, but keep tab IDs from original domain
      namedGroups[groupName] = urlGroups[domainRaw];

      if (debug) {
        console.log(`✅ [DEBUG][AI]: Named "${domainRaw}" as "${groupName}"`);
      }
    }

    if (Object.keys(namedGroups).length === 0) {
      throw new Error("No valid group names created from AI response.\nPlease try again.");
    }

    if (debug) {
      console.log(`✅ [DEBUG][AI]: ${Object.keys(namedGroups).length} final named groups`);
      Object.entries(namedGroups).forEach(([name, ids]) => {
        console.log(`  📌 "${name}": ${ids.length} tabs`);
      });
      console.log("✅ AI naming complete");
    }

    return { namedGroups, error: null };

  } catch (e) {
    console.error("❌ [AI Naming]:", e.message);
    
    if (debug) {
      console.error("❌ [DEBUG][AI]:", e);
    }

    return {
      namedGroups: null,
      error: e.message || "AI naming failed"
    };
  }
}