// ============================================================
// Mathspace Auto Solver — Main Content Script (Orchestrator)
// Coordinates detection, solving, and navigation
// ============================================================

(function () {
  'use strict';

  const STATUS = {
    IDLE: 'idle',
    STARTING: 'starting',
    DETECTING: 'detecting',
    SOLVING: 'solving',
    ANSWERING: 'answering',
    SUBMITTING: 'submitting',
    NAVIGATING: 'navigating',
    WAITING: 'waiting',
    COMPLETE: 'complete',
    ERROR: 'error',
    PAUSED: 'paused',
    UNLICENSED: 'unlicensed'
  };

  let currentStatus = STATUS.IDLE;
  let isRunning = false;
  let questionsCompleted = 0;
  let totalQuestions = 0;
  let currentSpeed = 'normal';
  let statusOverlay = null;

  // Speed delay ranges (ms)
  const SPEED_DELAYS = {
    careful: { min: 4000, max: 8000 },
    normal: { min: 2000, max: 4500 },
    fast: { min: 800, max: 2000 }
  };

  function getRandomDelay() {
    const range = SPEED_DELAYS[currentSpeed] || SPEED_DELAYS.normal;
    return range.min + Math.random() * (range.max - range.min);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---- Status Overlay ----

  function createOverlay() {
    if (statusOverlay) return;
    statusOverlay = document.createElement('div');
    statusOverlay.id = 'mas-status-overlay';
    statusOverlay.innerHTML = `
      <div class="mas-header">
        <div class="mas-logo">⚡ MAS</div>
        <div class="mas-status-dot"></div>
      </div>
      <div class="mas-status-text">Idle</div>
      <div class="mas-progress">
        <div class="mas-progress-bar"></div>
      </div>
      <div class="mas-progress-text">0/0</div>
    `;
    document.body.appendChild(statusOverlay);
  }

  function updateOverlay(status, text, progress = null) {
    if (!statusOverlay) createOverlay();
    const dot = statusOverlay.querySelector('.mas-status-dot');
    const statusText = statusOverlay.querySelector('.mas-status-text');
    const progressBar = statusOverlay.querySelector('.mas-progress-bar');
    const progressText = statusOverlay.querySelector('.mas-progress-text');

    statusText.textContent = text;

    // Update dot color
    dot.className = 'mas-status-dot';
    if ([STATUS.SOLVING, STATUS.ANSWERING, STATUS.SUBMITTING, STATUS.NAVIGATING].includes(status)) {
      dot.classList.add('active');
    } else if (status === STATUS.ERROR) {
      dot.classList.add('error');
    } else if (status === STATUS.COMPLETE) {
      dot.classList.add('complete');
    } else if (status === STATUS.PAUSED || status === STATUS.IDLE) {
      dot.classList.add('paused');
    }

    if (progress) {
      const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${progress.current}/${progress.total}`;
    }
  }

  function removeOverlay() {
    if (statusOverlay) {
      statusOverlay.remove();
      statusOverlay = null;
    }
  }

  // ---- Main Solver Loop ----

  async function runSolver() {
    if (!isRunning) return;

    // Check license
    const licenseStatus = await sendMessage({ type: 'CHECK_LICENSE' });
    if (!licenseStatus.valid) {
      updateStatus(STATUS.UNLICENSED, 'No valid license');
      isRunning = false;
      return;
    }

    createOverlay();
    updateStatus(STATUS.STARTING, 'Starting...');
    await delay(1000);

    while (isRunning) {
      try {
        // Wait for page to stabilize
        updateStatus(STATUS.WAITING, 'Waiting for page...');
        await Navigator.waitForStable(3000);
        await delay(500);

        // Check if we're on a question page
        if (!Detector.isQuestionPage()) {
          updateStatus(STATUS.WAITING, 'Not on a question page');
          await delay(2000);
          continue;
        }

        // Check if task is complete
        if (Detector.isTaskComplete()) {
          updateStatus(STATUS.COMPLETE, 'Task complete! 🎉');
          isRunning = false;
          notifyPopup({ type: 'TASK_COMPLETE' });
          break;
        }

        // Detect question type
        updateStatus(STATUS.DETECTING, 'Analyzing question...');
        const questionData = Detector.detect();

        // Update progress
        if (questionData.progress.totalQuestions) {
          totalQuestions = questionData.progress.totalQuestions;
        }
        if (questionData.progress.currentQuestion) {
          questionsCompleted = questionData.progress.currentQuestion - 1;
        }

        console.log('[MAS] Detected question:', questionData.type, questionData);

        if (questionData.type === 'unknown') {
          updateStatus(STATUS.ERROR, 'Could not detect question type');
          // Try clicking next step to skip
          const skipped = await Navigator.clickViewNextStep();
          if (!skipped) {
            await Navigator.clickNextQuestion();
          }
          await delay(getRandomDelay());
          continue;
        }

        // Solve the question
        updateStatus(STATUS.SOLVING, 'AI solving...');
        const answer = await Solver.solve(questionData);

        if (answer.error) {
          console.error('[MAS] Solve error:', answer.error);
          updateStatus(STATUS.ERROR, `Error: ${answer.error}`);
          // Try to skip
          await Navigator.clickViewNextStep();
          await delay(getRandomDelay());
          continue;
        }

        console.log('[MAS] Answer:', answer);

        // Input the answer
        updateStatus(STATUS.ANSWERING, 'Entering answer...');
        await delay(getRandomDelay() * 0.5);

        if (answer.type === 'multiple_choice' && answer.matchedChoice) {
          await Navigator.clickChoice(answer.matchedChoice);
        } else if (answer.type === 'input' && questionData.inputFields.length > 0) {
          // Fill each input field
          for (let i = 0; i < questionData.inputFields.length; i++) {
            const answerText = answer.answers[i] || answer.answers[0];
            if (answerText) {
              await Navigator.typeAnswer(questionData.inputFields[i], answerText, currentSpeed);
              await delay(300);
            }
          }
        }

        // Wait before submitting (human-like)
        await delay(getRandomDelay() * 0.5);

        // Submit
        updateStatus(STATUS.SUBMITTING, 'Submitting...');
        const submitted = await Navigator.clickSubmit();

        if (!submitted) {
          console.warn('[MAS] Could not find submit button');
          updateStatus(STATUS.ERROR, 'Submit button not found');
          await delay(2000);
          continue;
        }

        // Wait for feedback
        await delay(1500);
        await Navigator.waitForStable(3000);

        // Check feedback
        const feedback = Detector.detectFeedback();
        if (feedback) {
          if (feedback.type === 'correct') {
            questionsCompleted++;
            updateStatus(STATUS.NAVIGATING, 'Correct! Moving on...');
          } else {
            updateStatus(STATUS.NAVIGATING, 'Incorrect — skipping step...');
            await Navigator.clickViewNextStep();
            await delay(1000);
          }
        } else {
          // No feedback detected — might have auto-advanced
          questionsCompleted++;
        }

        // Navigate to next question
        await delay(getRandomDelay());
        updateStatus(STATUS.NAVIGATING, 'Going to next question...');

        const advanced = await Navigator.clickNextQuestion();
        if (!advanced) {
          // Maybe the question auto-advanced, or we're at the end
          if (Detector.isTaskComplete()) {
            updateStatus(STATUS.COMPLETE, 'Task complete! 🎉');
            isRunning = false;
            break;
          }
          // Wait and see if page updates
          await delay(2000);
        }

        // Update progress
        updateOverlay(currentStatus, '', {
          current: questionsCompleted,
          total: totalQuestions
        });

        // Random delay before next question
        await delay(getRandomDelay());

      } catch (error) {
        console.error('[MAS] Error in solver loop:', error);
        updateStatus(STATUS.ERROR, `Error: ${error.message}`);
        await delay(3000);
      }
    }
  }

  function updateStatus(status, text) {
    currentStatus = status;
    updateOverlay(status, text, {
      current: questionsCompleted,
      total: totalQuestions
    });
    notifyPopup({
      type: 'STATUS_UPDATE',
      status: status,
      text: text,
      questionsCompleted,
      totalQuestions
    });
  }

  function notifyPopup(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (e) {
      // Popup might not be open
    }
  }

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

  // ---- Message Listener (from popup) ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'START_SOLVER':
        if (!isRunning) {
          isRunning = true;
          currentSpeed = message.speed || 'normal';
          questionsCompleted = 0;
          totalQuestions = 0;
          runSolver();
        }
        sendResponse({ started: true });
        break;

      case 'STOP_SOLVER':
        isRunning = false;
        updateStatus(STATUS.IDLE, 'Stopped');
        setTimeout(removeOverlay, 2000);
        sendResponse({ stopped: true });
        break;

      case 'GET_SOLVER_STATUS':
        sendResponse({
          isRunning,
          status: currentStatus,
          questionsCompleted,
          totalQuestions
        });
        break;

      case 'UPDATE_SPEED':
        currentSpeed = message.speed || 'normal';
        sendResponse({ updated: true });
        break;
    }
    return true;
  });

  // ---- Auto-detect question page ----
  console.log('[MAS] Mathspace Auto Solver content script loaded');

})();
