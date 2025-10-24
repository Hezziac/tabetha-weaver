// ============================================================================
// TABS.JS - URL-BASED GROUPING WITH AI NAMING (FIXED)
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

    // ✅ KEY FIX: Get window ID from active tab, not from window list
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.windowId) {
      throw new Error("No active tab found. Cannot determine window.");
    }

    const currentWindowId = activeTab.windowId;

    if (debugMode) {
      console.log(`🪟 [DEBUG]: Window ID from active tab: ${currentWindowId}`);
    }

    // Update status: ANALYZING
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'analyzing',
        message: '🧠 Analyzing tabs...',
        timestamp: Date.now()
      }
    });

    // ✅ Query ALL tabs, then filter by the ACTIVE tab's window
    const allTabs = await chrome.tabs.query({});
    const tabs = allTabs.filter(tab => tab.windowId === currentWindowId && !tab.pinned);

    if (debugMode) {
      console.log(`📊 [DEBUG]: Found ${tabs.length} total tabs in window ${currentWindowId}`);
      // DEEP DEBUG: List all tabs
      // tabs.forEach((t, i) => {
      //   console.log(`  ${i + 1}. Tab ${t.id}: ${t.url?.substring(0, 60) || 'no-url'}... (Status: ${t.status}, Pinned: ${t.pinned})`);
      // });
    }

    if (currentSignal.aborted) throw new Error("Cancelled");

    // Filter accessible tabs
    const accessibleTabs = tabs.filter(tab => {
      // Must have URL
      if (!tab.url || typeof tab.url !== 'string') return false;
      
      // Must be HTTP/HTTPS (exclude chrome://, about:, etc.)
      if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false;
      
      // Exclude system URLs
      if (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://') || 
          tab.url.startsWith('about:') || tab.url.startsWith('edge://') || tab.url.startsWith('file://')) {
        return false;
      }
      
      // Skip discarded tabs
      if (tab.discarded) return false;
      
      // Accept 'complete' or 'loading'
      if (tab.status !== 'complete' && tab.status !== 'loading') return false;
      
      // Verify window ID (double-check)
      if (tab.windowId !== currentWindowId) return false;
      
      return true;
    });

    if (debugMode) {
      console.log(`✅ [DEBUG]: ${accessibleTabs.length} accessible tabs found`);
      // DEEP DEBUG: List accessible tabs
      // accessibleTabs.forEach((t, idx) => {
      //   console.log(`  📄 Tab ${t.id}: ${t.url?.substring(0, 70) || 'untitled'}... (Status: ${t.status})`);
      // });
    }

    if (accessibleTabs.length < 2) {
      throw new Error("Need at least 2 accessible tabs to create groups.");
    }

    // ========== GROUP BY DOMAIN ==========
    if (debugMode) {
      console.log("🔗 [DEBUG]: Starting URL-based grouping...");
    }

    const urlGroups = groupTabsByDomain(accessibleTabs, debugMode);

    if (debugMode) {
      console.log(`📋 [DEBUG]: Created ${Object.keys(urlGroups).length} domain groups`);
      Object.entries(urlGroups).forEach(([domain, tabIds]) => {
        console.log(`  🌐 ${domain}: ${tabIds.length} tabs`);
      });
    }

    if (currentSignal.aborted) throw new Error("Cancelled");

    if (Object.keys(urlGroups).length === 0) {
      throw new Error("No groupable tabs found. Need at least 2 tabs from the same domain.");
    }

    // ========== STORE PREVIEW ==========
    const previewData = {};
    for (const [domain, tabIds] of Object.entries(urlGroups)) {
      const tabObjects = accessibleTabs.filter(t => tabIds.includes(t.id));
      previewData[domain] = {
        tabIds: tabIds,
        urls: tabObjects.map(t => t.url),
        count: tabIds.length
      };
    }

    await chrome.storage.local.set({
      tab_grouping_preview: {
        groups: previewData,
        windowId: currentWindowId,
        timestamp: Date.now()
      }
    });

    // Signal popup to show preview
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'preview',
        message: '🎨 Ready to group tabs - confirm below',
        groupCount: Object.keys(urlGroups).length,
        timestamp: Date.now()
      }
    });

    if (debugMode) {
      console.log(`📊 [DEBUG]: Preview stored with ${Object.keys(urlGroups).length} groups`);
    }

    activeGroupingController = null;

    return {
      status: "preview",
      message: `Found ${Object.keys(urlGroups).length} groups ready to create`,
      groupCount: Object.keys(urlGroups).length
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
 * ✅ USE OLD GROUPING LOGIC - SIMPLE & RELIABLE
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
      domainMap[domain].push(tab.id);
    } catch (err) {
      if (debug) {
        console.warn(`⚠️ [DEBUG]: Could not parse URL: ${tab.url}`);
      }
    }
  }

  // Filter groups with fewer than minGroupSize tabs
  const result = {};
  for (const [domain, tabIds] of Object.entries(domainMap)) {
    if (tabIds.length >= minGroupSize) {
      result[domain] = tabIds;
      if (debug) {
        console.log(`✅ [DEBUG]: Domain group "${domain}": ${tabIds.length} tabs`);
      }
    } else {
      if (debug) {
        console.log(`⚠️ [DEBUG]: Excluding domain "${domain}": only ${tabIds.length} tab(s)`);
      }
    }
  }

  if (debug) {
    console.log(`📊 [DEBUG]: Final domain groups: ${Object.keys(result).length}`);
  }

  return result;
}

/**
 * ✅ NEW: CREATE GROUPS AFTER USER CONFIRMS
 */
export async function createGroupsFromPreview() {
  let debugMode = false;
  try {
    try {
      const stored = await chrome.storage.local.get('debugMode');
      debugMode = !!stored.debugMode;
    } catch (e) {
      debugMode = false;
    }

    if (debugMode) {
      console.log("🎨 [DEBUG]: Creating groups from preview...");
    }

    const previewData = await chrome.storage.local.get('tab_grouping_preview');
    if (!previewData.tab_grouping_preview) {
      throw new Error("No preview data found");
    }

    const { groups, windowId } = previewData.tab_grouping_preview;
    const currentSignal = activeGroupingController?.signal;

    // ========== STEP 3: ASK AI TO NAME GROUPS ==========
    if (debugMode) {
      console.log("📤 [DEBUG]: Asking AI for creative group names...");
    }

    const domainList = Object.keys(groups);
    const domainDescriptions = domainList
      .map(domain => `${domain} (${groups[domain].count} tabs)`)
      .join('\n');

    // Get a tab to run AI in - use first available tab from ANY domain
    let targetTab = null;
    for (const domain of domainList) {
      if (groups[domain].tabIds.length > 0) {
        targetTab = await chrome.tabs.get(groups[domain].tabIds[0]).catch(() => null);
        if (targetTab) break;
      }
    }

    if (!targetTab) {
      throw new Error("No valid tab found for AI execution");
    }

    let aiResult;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: executeAINaming,
        args: [{ domains: domainList, descriptions: domainDescriptions }, debugMode]
      });

      aiResult = result.result;
      
      if (debugMode && aiResult.usingFallback) {
        console.log("🔄 [DEBUG]: AI naming used fallback names");
      }
      
    } catch (e) {
      if (debugMode) {
        console.error("❌ [DEBUG]: AI execution failed:", e);
      }
      // ✅ NEW: Use fallback names immediately instead of throwing
      if (debugMode) {
        console.log("🔄 [DEBUG]: Using fallback names due to AI error");
      }
      aiResult = {
        namedGroups: {},
        error: null
      };
      // Populate with fallbacks below
    }

    let domainToGroupName = aiResult?.namedGroups || {};

    // ✅ NEW: Always ensure all domains have names
    for (const domain of domainList) {
      if (!domainToGroupName[domain]) {
        domainToGroupName[domain] = createBasicGroupName(domain);
        if (debugMode) {
          console.log(`🔄 [DEBUG]: Added fallback name for "${domain}": "${domainToGroupName[domain]}"`);
        }
      }
    }

    if (debugMode) {
      console.log(`📋 [DEBUG]: ${Object.keys(domainToGroupName).length} groups with names (including fallbacks)`);
    }

    // Update status: GROUPING
    await chrome.storage.local.set({
      tab_grouping_status: {
        status: 'grouping',
        message: '🎨 Creating Groups...',
        groupCount: Object.keys(groups).length,
        timestamp: Date.now()
      }
    });

    // ========== STEP 4: CREATE TAB GROUPS ==========
    const colors = ["blue", "red", "green", "yellow", "pink", "purple", "cyan"];
    let colorIndex = 0;
    const report = [];
    const alreadyGroupedIds = new Set();
    const failedGroups = [];

    // Get fresh tab list to check for already-grouped tabs
    const allTabs = await chrome.tabs.query({ windowId });
    for (const tab of allTabs) {
      if (tab.groupId && tab.groupId > 0) {
        alreadyGroupedIds.add(tab.id);
        if (debugMode) {
          console.log(`ℹ️ [DEBUG]: Tab ${tab.id} already in group ${tab.groupId} (skipping)`);
        }
      }
    }

    // Process each domain group
    for (const domain of domainList) {
      if (currentSignal?.aborted) throw new Error("Cancelled");

      try {
        const tabIds = groups[domain].tabIds;
        const groupName = domainToGroupName[domain] || createBasicGroupName(domain);

        // Filter out already grouped tabs
        let ungroupedTabIds = tabIds.filter(id => !alreadyGroupedIds.has(id));

        if (ungroupedTabIds.length < 2) {
          if (debugMode) {
            console.log(`⚠️ [DEBUG]: Skipping "${groupName}" - only ${ungroupedTabIds.length} ungrouped tabs`);
          }
          failedGroups.push({ name: groupName, reason: 'insufficient_tabs' });
          continue;
        }

        // ✅ FIX: Re-validate tabs RIGHT BEFORE grouping
        const validTabIds = [];
        for (const id of ungroupedTabIds) {
          try {
            const tab = await chrome.tabs.get(id);
            
            // ✅ STRICT validation
            if (tab.windowId !== windowId) {
              if (debugMode) console.warn(`⚠️ [DEBUG]: Tab ${id} in different window (${tab.windowId} vs ${windowId})`);
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
          }
        }

        if (validTabIds.length < 2) {
          if (debugMode) {
            console.warn(`⚠️ [DEBUG]: "${groupName}" - not enough valid tabs after re-validation`);
          }
          failedGroups.push({ name: groupName, reason: 'insufficient_valid_tabs' });
          continue;
        }

        // ✅ Create group with retry logic
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

        await new Promise(r => setTimeout(r, 25));

      } catch (err) {
        if (debugMode) {
          console.error(`❌ [DEBUG]: Outer error for "${domain}": ${err.message}`);
        }
        failedGroups.push({ name: domainToGroupName[domain], reason: err.message });
      }
    }

    if (report.length === 0) {
      throw new Error("No groups were successfully created.");
    }

    // Complete
    const summary = report.map(g => `📌 ${g.name} (${g.tabCount} tabs)`).join('\n');
    const failedSummary = failedGroups.length > 0 
      ? `\n\n⚠️ Was Already Created/Failed to create ${failedGroups.length} groups`
      : '';

    if (debugMode) {
      console.log(`🎉 [DEBUG]: SUCCESS! ${report.length} groups created${failedGroups.length > 0 ? `, ${failedGroups.length} failed` : ''}`);
    }
    console.log(`🎉 Complete! ${report.length} groups created${failedSummary}`);

    // Cleanup preview
    await chrome.storage.local.remove('tab_grouping_preview');

    // Store final result
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
 * ✅ FIXED: GROUP TABS BY MAIN DOMAIN (extracts main domain from subdomains)
 */
function groupTabsByMainDomain(accessibleTabs, debug) {
  const domainMap = {};
  const minGroupSize = 2;

  for (const tab of accessibleTabs) {
    if (!tab.url) continue;

    try {
      const urlObj = new URL(tab.url);
      let domain = urlObj.hostname || 'unknown';
      
      // ✅ FIXED: Extract main domain properly
      // e.g., "googlechromeai2025.devpost.com" -> "devpost.com"
      // e.g., "mail.google.com" -> "google.com"
      // e.g., "www.github.com" -> "github.com"
      const domainParts = domain.split('.');
      
      let mainDomain = domain;
      if (domainParts.length > 2) {
        // Check if it's a known 2-level TLD (co.uk, com.au, etc.)
        const twoLevelTLDs = ['co.uk', 'com.au', 'co.in', 'co.jp', 'com.br'];
        const lastTwo = domainParts.slice(-2).join('.');
        
        if (twoLevelTLDs.includes(lastTwo)) {
          mainDomain = domainParts.slice(-3).join('.');
        } else {
          mainDomain = domainParts.slice(-2).join('.');
        }
      }

      if (!domainMap[mainDomain]) {
        domainMap[mainDomain] = {
          tabIds: [],
          urls: []
        };
      }
      domainMap[mainDomain].tabIds.push(tab.id);
      domainMap[mainDomain].urls.push(tab.url);

    } catch (err) {
      if (debug) {
        console.warn(`⚠️ [DEBUG]: Could not parse URL: ${tab.url}`);
      }
    }
  }

  // Filter groups with fewer than minGroupSize tabs
  const result = {};
  for (const [domain, groupData] of Object.entries(domainMap)) {
    if (groupData.tabIds.length >= minGroupSize) {
      result[domain] = groupData;
      if (debug) {
        console.log(`✅ [DEBUG]: Domain group "${domain}": ${groupData.tabIds.length} tabs`);
      }
    } else {
      if (debug) {
        console.log(`⚠️ [DEBUG]: Excluding domain "${domain}": only ${groupData.tabIds.length} tab(s)`);
      }
    }
  }

  if (debug) {
    console.log(`📊 [DEBUG]: Final domain groups: ${Object.keys(result).length}`);
  }

  return result;
}

/**
 * ✅ FIXED: AI NAMING with user interaction requirement
 */
/**
 * ✅ FIXED: AI NAMING with fallback names
 */
async function executeAINaming(domainInfo, debug) {
  try {
    if (debug) {
      console.log("🤖 [DEBUG][AI]: Starting naming in page context");
      console.log(`📊 [DEBUG][AI]: ${domainInfo.domains.length} domain groups to name`);
    }

    const prompt = `You are Tabetha Weaver, expert at naming browser tab groups.

      Provide creative, meaningful names for these domain-based tab groups:

      ${domainInfo.descriptions}

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
        - devpost.com|Hackathons & Projects
      6. Be creative but concise
      7. Return ONLY the naming output (DOMAIN|GROUP_NAME per line), NO explanations

      Start:
    `;

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

    if (availability === "downloading") {
      if (debug) {
        console.log("⏳ [DEBUG][AI]: Model downloading, waiting for interaction...");
      }
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

    // Parse response
    const namedGroups = {};
    const lines = aiResponse.trim().split('\n');

    if (debug) {
      console.log(`📋 [DEBUG][AI]: Processing ${lines.length} response lines`);
    }

    for (const line of lines) {
      const trimmed = String(line || '').trim();
      
      if (!trimmed || !trimmed.includes('|')) continue;

      const parts = trimmed.split('|');
      if (parts.length < 2) continue;

      const domainRaw = String(parts[0] || '').trim().toLowerCase();
      const groupNameRaw = parts.slice(1).join('|').trim();

      if (!domainRaw || !groupNameRaw) continue;

      // Check if domain is in our list
      if (!domainInfo.domains.includes(domainRaw)) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Domain "${domainRaw}" not in request`);
        }
        continue;
      }

      const groupName = String(groupNameRaw)
        .replace(/[^a-zA-Z0-9\s&-]/g, '')
        .trim()
        .substring(0, 50);

      if (groupName.length < 2) {
        if (debug) {
          console.log(`⚠️ [DEBUG][AI]: Group name too short: "${groupName}"`);
        }
        continue;
      }

      namedGroups[domainRaw] = groupName;

      if (debug) {
        console.log(`✅ [DEBUG][AI]: Named "${domainRaw}" as "${groupName}"`);
      }
    }

    // ✅ NEW: Ensure ALL domains have names (use fallback if AI missed any)
    for (const domain of domainInfo.domains) {
      if (!namedGroups[domain]) {
        namedGroups[domain] = createBasicGroupName(domain);
        if (debug) {
          console.log(`🔄 [DEBUG][AI]: Using fallback for "${domain}": "${namedGroups[domain]}"`);
        }
      }
    }

    if (debug) {
      console.log(`✅ [DEBUG][AI]: ${Object.keys(namedGroups).length} groups named (with fallbacks)`);
    }

    return { namedGroups, error: null };

  } catch (e) {
    console.error("❌ [AI Naming]:", e.message);
    
    if (debug) {
      console.error("❌ [DEBUG][AI]:", e);
    }

    // ✅ NEW: Return ALL domains with fallback names on error
    const fallbackGroups = {};
    for (const domain of domainInfo.domains) {
      fallbackGroups[domain] = createBasicGroupName(domain);
    }

    return {
      namedGroups: fallbackGroups,
      error: null, // ✅ Don't error - use fallbacks instead
      usingFallback: true
    };
  }
}

/**
 * Helper: Create a basic group name from a domain
 */
function createBasicGroupName(domain) {
  let cleaned = domain.replace(/^www\./, '');
  const parts = cleaned.split('.');
  let baseName = parts[0] || domain;
  
  baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
  
  const specialCases = {
    'github': 'GitHub',
    'devpost': 'DevPost & Hackathons',
    'google': 'Google Services',
    'googlechromeai2025': 'Chrome AI Challenge',
    'youtube': 'YouTube Videos',
    'twitter': 'Twitter/X',
    'linkedin': 'LinkedIn',
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'reddit': 'Reddit',
    'stackoverflow': 'Stack Overflow',
    'gmail': 'Gmail',
    'outlook': 'Outlook',
    'amazon': 'Amazon',
    'ebay': 'eBay',
    'netflix': 'Netflix',
    'spotify': 'Spotify',
    'docs': 'Google Docs'
  };
  
  return specialCases[baseName.toLowerCase()] || baseName;
}