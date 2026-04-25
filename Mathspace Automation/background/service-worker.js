// ============================================================
// Mathspace Auto Solver — Background Service Worker
// Handles: screenshot capture, Gemini API calls, license verification
// ============================================================

// ---- License Verification (Gumroad) ----

const GUMROAD_PRODUCT_IDS = {
  lifetime: 'YOUR_LIFETIME_PRODUCT_ID',
  monthly: 'YOUR_MONTHLY_PRODUCT_ID',
  annual: 'YOUR_ANNUAL_PRODUCT_ID'
};

const TEST_LICENSE_KEY = 'MAS-TEST-KEY-2026';

async function verifyLicense(licenseKey) {
  // Check for test key first
  if (licenseKey === TEST_LICENSE_KEY) {
    return {
      valid: true,
      tier: 'lifetime',
      email: 'tester@example.com',
      purchaseDate: new Date().toISOString(),
      refunded: false,
      disputed: false
    };
  }

  // Try each product ID until we find a match
  for (const [tier, productId] of Object.entries(GUMROAD_PRODUCT_IDS)) {
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `product_id=${productId}&license_key=${licenseKey}&increment_uses_count=false`
      });
      const data = await response.json();
      if (data.success) {
        return {
          valid: true,
          tier: tier,
          email: data.purchase?.email || '',
          purchaseDate: data.purchase?.created_at || '',
          refunded: data.purchase?.refunded || false,
          disputed: data.purchase?.disputed || false
        };
      }
    } catch (e) {
      console.error(`License check failed for tier ${tier}:`, e);
    }
  }
  return { valid: false };
}

async function activateLicense(licenseKey) {
  // Check for test key first
  if (licenseKey === TEST_LICENSE_KEY) {
    const licenseData = {
      key: licenseKey,
      tier: 'lifetime',
      email: 'tester@example.com',
      activatedAt: Date.now(),
      lastVerified: Date.now(),
      valid: true
    };
    await chrome.storage.local.set({ license: licenseData });
    return { success: true, tier: 'lifetime', email: 'tester@example.com' };
  }

  for (const [tier, productId] of Object.entries(GUMROAD_PRODUCT_IDS)) {
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `product_id=${productId}&license_key=${licenseKey}&increment_uses_count=true`
      });
      const data = await response.json();
      if (data.success && !data.purchase?.refunded && !data.purchase?.disputed) {
        const licenseData = {
          key: licenseKey,
          tier: tier,
          email: data.purchase?.email || '',
          activatedAt: Date.now(),
          lastVerified: Date.now(),
          valid: true
        };
        await chrome.storage.local.set({ license: licenseData });
        return { success: true, tier, email: licenseData.email };
      }
    } catch (e) {
      console.error(`Activation failed for tier ${tier}:`, e);
    }
  }
  return { success: false, error: 'Invalid or expired license key' };
}

async function checkLicenseStatus() {
  const { license } = await chrome.storage.local.get('license');
  if (!license || !license.valid) return { valid: false };

  // Re-verify every 24 hours
  const hoursSinceVerify = (Date.now() - license.lastVerified) / (1000 * 60 * 60);
  if (hoursSinceVerify > 24) {
    const result = await verifyLicense(license.key);
    if (result.valid && !result.refunded && !result.disputed) {
      license.lastVerified = Date.now();
      await chrome.storage.local.set({ license });
      return { valid: true, tier: license.tier };
    } else {
      license.valid = false;
      await chrome.storage.local.set({ license });
      return { valid: false };
    }
  }
  return { valid: true, tier: license.tier };
}


// ---- Screenshot Capture ----

async function captureScreenshot() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });
    return dataUrl;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return null;
  }
}


// ---- Gemini API Integration ----

async function callGeminiAPI(prompt, imageBase64 = null, mimeType = 'image/png') {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (!geminiApiKey) {
    return { error: 'No Gemini API key configured' };
  }

  const MODEL = 'gemini-2.5-flash';
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiApiKey}`;

  const parts = [{ text: prompt }];

  if (imageBase64) {
    // Remove data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: cleanBase64
      }
    });
  }

  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024
        }
      })
    });

    if (response.status === 429) {
      return { error: 'Rate limited — waiting before retry', rateLimited: true };
    }

    if (!response.ok) {
      const errText = await response.text();
      return { error: `API error ${response.status}: ${errText}` };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { success: true, answer: text.trim() };
  } catch (error) {
    return { error: `Network error: ${error.message}` };
  }
}

async function solveWithScreenshot(screenshotDataUrl, questionContext) {
  const prompt = `You are an expert math tutor solving a question on Mathspace (an online math learning platform).

LOOK AT THE SCREENSHOT CAREFULLY. It shows a math question that needs to be answered.

CONTEXT FROM THE PAGE:
${questionContext}

RULES:
1. Provide ONLY the final answer — no explanations, no working, no units (unless the input field doesn't already show them).
2. If it's multiple choice, respond with ONLY the exact text of the correct option.
3. If the answer is a number, respond with ONLY the number (e.g., "90" not "90 mm").
4. If there are multiple input fields, provide answers separated by ||| (e.g., "45|||90|||180").
5. If the question involves an image/diagram, analyze it carefully to extract all relevant measurements.
6. For fractions, use the format a/b (e.g., "3/4").
7. For negative numbers, use - prefix (e.g., "-5").
8. Be precise — decimal answers should be exact where possible.

ANSWER:`;

  return await callGeminiAPI(prompt, screenshotDataUrl);
}

async function solveWithText(questionText, questionType) {
  let prompt;

  if (questionType === 'multiple_choice') {
    prompt = `You are solving a multiple choice math question. 

QUESTION: ${questionText}

Respond with ONLY the exact text of the correct answer option. Nothing else.

ANSWER:`;
  } else {
    prompt = `You are solving a math question on Mathspace.

QUESTION: ${questionText}

RULES:
1. Provide ONLY the final numerical answer.
2. No explanations, no units, no working.
3. If multiple answers needed, separate with |||
4. For fractions use a/b format.
5. Be precise with decimals.

ANSWER:`;
  }

  return await callGeminiAPI(prompt);
}


// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'CAPTURE_SCREENSHOT':
        const screenshot = await captureScreenshot();
        return { screenshot };

      case 'SOLVE_SCREENSHOT':
        const screenshotResult = await solveWithScreenshot(
          message.screenshot,
          message.context || ''
        );
        return screenshotResult;

      case 'SOLVE_TEXT':
        const textResult = await solveWithText(
          message.questionText,
          message.questionType || 'numeric'
        );
        return textResult;

      case 'ACTIVATE_LICENSE':
        const activationResult = await activateLicense(message.licenseKey);
        return activationResult;

      case 'CHECK_LICENSE':
        const licenseStatus = await checkLicenseStatus();
        return licenseStatus;

      case 'DEACTIVATE_LICENSE':
        await chrome.storage.local.remove('license');
        return { success: true };

      case 'GET_STATUS':
        const { license } = await chrome.storage.local.get('license');
        const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
        return {
          hasLicense: license?.valid || false,
          licenseTier: license?.tier || null,
          hasApiKey: !!geminiApiKey
        };

      default:
        return { error: 'Unknown message type' };
    }
  };

  handler().then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });

  return true; // Keep message channel open for async response
});

// ---- Install/Update Handler ----
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Mathspace Auto Solver installed!');
  }
});
