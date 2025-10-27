# 🤖 Tabetha Weaver: Your AI Tab Assistant

**Tabetha Weaver** is a high-performance Chrome Extension designed to solve information overload by using **client-side AI (Gemini Nano)** to analyze and organize your open tabs and existing content.

## 🚀 Quick Start & Installation

### **Step 1: Clone the Code**

1. **Download the repository to your local machine:**
   ```bash
   git clone https://github.com/Hezziac/tabetha-weaver.git
   cd tabetha-weaver

## ✨ Core Features & API Showcase

- **🖼️ Alt Text Generation** - Generate SEO-optimized alt text for images with one right-click
- **✏️ Text Rewriting** - Transform text with 4 tones: Simplify, Formal, Casual, De-Redundify
- **✍️ Content Creation** - Generate entirely new writing from scratch or reference material
- **📋 Smart Summaries** - Condense webpages or pasted text (4 format options)
- **🤖 AI Chat** - Talk directly to Tabetha for quick assistance
- **📂 Intelligent Tab Grouping** - Auto-organize tabs with AI-powered naming



| Feature | API Used | Purpose |
| :--- | :--- | :--- |
| **🧠 Intelligent Tab Grouping** | Prompt API, `chrome.tabs`, `chrome.tabGroups` | Analyzes page content (headings & URLs) and automatically groups tabs by topic relevance, renaming the group with an AI-generated title. |
| **📄 Content Summarization** | Summarizer API | Condenses any web page content or user-pasted text into a concise summary with adjustable length (Short/Medium/Long). |
| **✏️ Writing Refinement** | Rewriter API, Proofreader API | Offers quick, non-disruptive editing for tone, clarity, and grammar on selected text via the right-click menu. |
| **🖼️ Alt Image Generation** | Prompt API (Multimodal) | Right-click any image to instantly generate descriptive, accessible Alt Text. |

---

## 🚀 Installation & Setup (MVP)

This extension uses experimental Chrome APIs and requires a specific setup to run the local AI models.

### **Step 1: Enable Chrome AI Flags**

Navigate to `chrome://flags#FLAG_NAME` and ensure these crucial features are explicitly set:

| Flag Name | Value to Set | Purpose |
| :--- | :--- | :--- |
| **`#optimization-guide-on-device-model`** | **Enabled BypassPerfRequirement** | Bypasses local hardware checks to enable the core Gemini Nano runtime. |
| **`#summarization-api-for-gemini-nano`** | **Enabled** | Enables the Summarizer API. |
| **`#prompt-api-for-gemini-nano`** | **Enabled** | Enables the Prompt and Multimodal APIs (required for Tab Grouping and Alt Text). |

**ACTION:** **Relaunch** your browser after setting these flags.

### **Step 2: Download and Verify the Model**

The necessary AI model must be downloaded to your computer's storage (approx. 4 GB).

1.  Navigate to **`chrome://components`**.
2.  Find **"Optimization Guide On Device Model"**.
3.  Click **`Check for update`**. Wait until the status shows a version number (e.g., `2025.06.30.1229`) and confirms it is **Up-to-date**.
4.  Verify the status at **`chrome://on-device-internals`**. The `Foundational model state` should be **`Ready`** or **`Available`**.

### **Step 3: Load the Extension**

1.  **Download and Unzip:** Download this repository from GitHub and unzip the contents to a local folder (e.g., `tabetha-weaver-MVP`).
2.  **Open Chrome Extensions:** Navigate to **`chrome://extensions`**.
3.  **Enable Developer Mode:** Toggle the switch in the upper-right corner. 
4.  **Load Unpacked:** Click the **`Load unpacked`** button and select the folder where you unzipped the project.

---

## 🎯 Usage

1.  **Summarize Active Page/Pasted Text:**
    * Open a long article (e.g., a Wikipedia page).
    * Click the Tabetha Weaver icon and select a length (`Short`, `Medium`, or `Long`).
    * Click **`Summarize This Page`** (or paste text and click **`Generate Summary`**).
2.  **AI Tab Grouping:**
    * Open multiple tabs related to different topics (e.g., three shopping, two news).
    * Click the Tabetha Weaver icon and click **`Group All Tabs`**.
    * The extension will automatically group them and assign descriptive names and colors (e.g., "Shopping Sites," "Current Events").
3.  **Multimodal & Writing Refinement (Right-Click Menu)**
    * Right-click on any image to use the Alt Image Generation feature.
    * Highlight text and Right-click to access the Proofread and Rewrite tools.

---

## 🛠️ Code Architecture

The project adheres to Manifest V3 best practices for maintainability and security:

* **ES Modules:** The background script is defined with `"type": "module"`, allowing it to securely `import` helper functions from local files (`tabs.js`, `rewriter.js`).
* **Context Injection:** AI operations rely entirely on **`chrome.scripting.executeScript`** to run the API logic within the secure, top-level context of the user's tab, bypassing CSP restrictions.
* **Storage Management:** The **`chrome.storage.local`** API is used to persistently save the latest summary status and results, enabling the UI to update instantly when reopened.