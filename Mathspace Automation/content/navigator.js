// ============================================================
// Mathspace Auto Solver — Navigator
// Handles clicking submit, next, complete buttons
// ============================================================

const Navigator = {
  /**
   * Type an answer into an input field with human-like behavior
   */
  async typeAnswer(inputField, answer, speed = 'normal') {
    const el = inputField.element;
    const delays = { careful: 150, normal: 80, fast: 30 };
    const charDelay = delays[speed] || 80;

    // Focus the element
    el.focus();
    el.click();
    await this.delay(200);

    // Clear existing content
    if (inputField.type === 'contenteditable' || inputField.type === 'mathquill') {
      el.textContent = '';
      el.innerHTML = '';
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } else {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await this.delay(100);

    // Type character by character
    for (const char of answer) {
      if (inputField.type === 'contenteditable' || inputField.type === 'mathquill') {
        document.execCommand('insertText', false, char);
      } else {
        el.value += char;
      }

      // Fire realistic events
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      await this.delay(charDelay + Math.random() * 50);
    }

    // Trigger change event
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    await this.delay(300);
  },

  /**
   * Click a multiple choice option
   */
  async clickChoice(choice) {
    const el = choice.element;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(500);

    // Simulate realistic click
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
    const y = rect.top + rect.height / 2 + (Math.random() * 10 - 5);

    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
    await this.delay(100);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    await this.delay(50);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    await this.delay(300);

    // Also try clicking child elements (radio button inside label, etc.)
    const radio = el.querySelector('input[type="radio"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },

  /**
   * Click the submit button
   */
  async clickSubmit() {
    const btn = Detector.findSubmitButton();
    if (!btn) {
      console.warn('Submit button not found');
      return false;
    }

    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(400);
    btn.click();
    await this.delay(1000);
    return true;
  },

  /**
   * Click the "View next step" button
   */
  async clickViewNextStep() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase().trim();
      if (text?.includes('view next step') || text?.includes('next step') || text?.includes('show step')) {
        if (btn.offsetParent !== null && !btn.disabled) {
          btn.click();
          await this.delay(1000);
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Navigate to the next question
   */
  async clickNextQuestion() {
    // Try the forward arrow button
    const arrows = document.querySelectorAll('button');
    for (const btn of arrows) {
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
      if (text === '>' || text === '→' || text === '›' || ariaLabel.includes('next')) {
        if (btn.offsetParent !== null && !btn.disabled) {
          btn.click();
          await this.delay(1500);
          return true;
        }
      }
    }

    // Try clicking the next numbered circle
    const progress = MathParser.getProgressInfo();
    if (progress.currentQuestion && progress.totalQuestions) {
      const nextNum = progress.currentQuestion + 1;
      if (nextNum <= progress.totalQuestions) {
        const navButtons = document.querySelectorAll('[class*="question-nav"] button, [class*="questionNav"] button, [class*="StepNav"] button');
        for (const btn of navButtons) {
          if (btn.textContent?.trim() === String(nextNum)) {
            btn.click();
            await this.delay(1500);
            return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * Try to click the complete/finish button
   */
  async clickComplete() {
    const completionTexts = ['complete', 'finish', 'done', 'end task', 'complete task'];
    const buttons = document.querySelectorAll('button, a');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase().trim();
      if (completionTexts.some(t => text?.includes(t))) {
        if (btn.offsetParent !== null && !btn.disabled) {
          btn.click();
          await this.delay(1000);
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Wait for page to stabilize (no more DOM changes)
   */
  async waitForStable(timeout = 5000) {
    return new Promise((resolve) => {
      let timer;
      let resolved = false;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          if (!resolved) { resolved = true; resolve(); }
        }, 800);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      timer = setTimeout(() => {
        observer.disconnect();
        if (!resolved) { resolved = true; resolve(); }
      }, timeout);
    });
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

window.Navigator = Navigator;
