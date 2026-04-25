// ============================================================
// Mathspace Auto Solver — Popup Script
// Controls license activation, API key setup, solver start/stop
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // ---- Elements ----
  const mainView = document.getElementById('main-view');
  const licenseView = document.getElementById('license-view');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const progressBadge = document.getElementById('progress-badge');
  const progressBar = document.getElementById('progress-bar');
  const powerBtn = document.getElementById('power-btn');
  const powerIcon = document.getElementById('power-icon');
  const powerLabel = document.getElementById('power-label');
  const speedBtns = document.querySelectorAll('.speed-btn');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const apiStatus = document.getElementById('api-status');
  const apiHelpBtn = document.getElementById('api-help-btn');
  const apiGuideModal = document.getElementById('api-guide-modal');
  const closeGuideBtn = document.getElementById('close-guide');
  const licenseKeyInput = document.getElementById('license-key-input');
  const activateBtn = document.getElementById('activate-btn');
  const licenseError = document.getElementById('license-error');
  const licenseBadge = document.getElementById('license-badge');
  const deactivateBtn = document.getElementById('deactivate-btn');
  const purchaseLink = document.getElementById('purchase-link');

  let isRunning = false;
  let currentSpeed = 'normal';

  // ---- Gumroad Purchase Link ----
  // Replace with your actual Gumroad product URL
  purchaseLink.href = 'https://YOUR_GUMROAD_USERNAME.gumroad.com/l/mathspace-solver';

  // ---- Initialize ----
  await checkAndShowView();
  await loadApiKeyStatus();
  await loadSolverStatus();
  await loadSpeedSetting();

  // ---- View Management ----

  async function checkAndShowView() {
    try {
      const response = await sendMessage({ type: 'CHECK_LICENSE' });
      if (response.valid) {
        showMainView(response.tier);
      } else {
        showLicenseView();
      }
    } catch (err) {
      // If service worker isn't ready, show license view
      showLicenseView();
    }
  }

  function showMainView(tier) {
    mainView.classList.remove('hidden');
    licenseView.classList.add('hidden');
    if (tier) {
      licenseBadge.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    }
  }

  function showLicenseView() {
    mainView.classList.add('hidden');
    licenseView.classList.remove('hidden');
  }

  // ---- License Activation ----

  activateBtn.addEventListener('click', async () => {
    const key = licenseKeyInput.value.trim();
    if (!key) {
      showLicenseError('Please enter a license key');
      return;
    }

    activateBtn.disabled = true;
    activateBtn.textContent = 'Verifying...';
    licenseError.classList.add('hidden');

    try {
      const result = await sendMessage({ type: 'ACTIVATE_LICENSE', licenseKey: key });
      if (result.success) {
        showMainView(result.tier);
      } else {
        showLicenseError(result.error || 'Invalid license key. Please check and try again.');
      }
    } catch (err) {
      showLicenseError('Connection error. Please try again.');
    }

    activateBtn.disabled = false;
    activateBtn.textContent = 'Activate';
  });

  // Handle Enter key in license input
  licenseKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') activateBtn.click();
  });

  deactivateBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to deactivate your license?')) {
      await sendMessage({ type: 'DEACTIVATE_LICENSE' });
      showLicenseView();
    }
  });

  function showLicenseError(msg) {
    licenseError.textContent = msg;
    licenseError.classList.remove('hidden');
  }

  // ---- API Key Management ----

  async function loadApiKeyStatus() {
    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    if (geminiApiKey) {
      apiStatus.textContent = 'Active';
      apiStatus.classList.add('set');
      apiKeyInput.placeholder = '••••••••••••';
    } else {
      apiStatus.textContent = 'Not set';
      apiStatus.classList.remove('set');
    }
  }

  saveApiKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;

    await chrome.storage.local.set({ geminiApiKey: key });
    apiKeyInput.value = '';
    await loadApiKeyStatus();

    // Flash success
    saveApiKeyBtn.textContent = '✓';
    setTimeout(() => { saveApiKeyBtn.textContent = 'Save'; }, 1500);
  });

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKeyBtn.click();
  });

  // ---- API Guide Modal ----

  apiHelpBtn.addEventListener('click', () => {
    apiGuideModal.classList.remove('hidden');
  });

  closeGuideBtn.addEventListener('click', () => {
    apiGuideModal.classList.add('hidden');
  });

  apiGuideModal.addEventListener('click', (e) => {
    if (e.target === apiGuideModal) {
      apiGuideModal.classList.add('hidden');
    }
  });

  // ---- Power Button (Start/Stop) ----

  powerBtn.addEventListener('click', async () => {
    // Check API key first
    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    if (!geminiApiKey && !isRunning) {
      alert('Please set your Gemini API key first. Click "How to get a free API key" for instructions.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    if (!isRunning) {
      // Start
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'START_SOLVER',
          speed: currentSpeed
        });
        setRunningState(true);
      } catch (err) {
        alert('Please navigate to a Mathspace question page first.');
      }
    } else {
      // Stop
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_SOLVER' });
      } catch (e) {}
      setRunningState(false);
    }
  });

  function setRunningState(running) {
    isRunning = running;
    if (running) {
      powerBtn.classList.add('running');
      powerLabel.textContent = 'Stop Solving';
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Running...';
    } else {
      powerBtn.classList.remove('running');
      powerLabel.textContent = 'Start Solving';
      statusDot.className = 'status-dot';
      statusText.textContent = 'Idle';
    }
  }

  // ---- Speed Control ----

  async function loadSpeedSetting() {
    const { solverSpeed } = await chrome.storage.local.get('solverSpeed');
    if (solverSpeed) {
      currentSpeed = solverSpeed;
      speedBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.speed === currentSpeed);
      });
    }
  }

  speedBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      currentSpeed = btn.dataset.speed;
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      await chrome.storage.local.set({ solverSpeed: currentSpeed });

      // Update running solver speed
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_SPEED', speed: currentSpeed });
        } catch (e) {}
      }
    });
  });

  // ---- Status Updates from Content Script ----

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATUS_UPDATE') {
      statusText.textContent = message.text || message.status;
      progressBadge.textContent = `${message.questionsCompleted || 0}/${message.totalQuestions || 0}`;

      const pct = message.totalQuestions > 0
        ? (message.questionsCompleted / message.totalQuestions) * 100
        : 0;
      progressBar.style.width = `${pct}%`;

      // Update dot
      statusDot.className = 'status-dot';
      const activeStates = ['solving', 'answering', 'submitting', 'navigating', 'detecting'];
      if (activeStates.includes(message.status)) {
        statusDot.classList.add('active');
      } else if (message.status === 'error') {
        statusDot.classList.add('error');
      } else if (message.status === 'complete') {
        statusDot.classList.add('complete');
        setRunningState(false);
      }
    }

    if (message.type === 'TASK_COMPLETE') {
      setRunningState(false);
      statusText.textContent = 'Task complete! 🎉';
      statusDot.className = 'status-dot complete';
    }
  });

  // ---- Load Solver Status ----

  async function loadSolverStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    try {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SOLVER_STATUS' });
      if (status?.isRunning) {
        setRunningState(true);
        statusText.textContent = status.status || 'Running...';
        progressBadge.textContent = `${status.questionsCompleted || 0}/${status.totalQuestions || 0}`;
      }
    } catch (e) {
      // Content script not loaded on this page
    }
  }

  // ---- Helpers ----

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    });
  }
});
