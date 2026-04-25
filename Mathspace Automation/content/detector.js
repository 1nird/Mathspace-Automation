// ============================================================
// Mathspace Auto Solver — Question Detector
// Identifies question types and extracts structured data
// ============================================================

const Detector = {
  /**
   * Analyze the current page and return structured question data
   */
  detect() {
    const questionText = MathParser.extractQuestionText();
    const inputs = MathParser.findInputFields();
    const choices = MathParser.findChoices();
    const images = MathParser.findImages();
    const progress = MathParser.getProgressInfo();

    let type = 'unknown';

    if (choices.length >= 2) {
      type = 'multiple_choice';
    } else if (inputs.length > 0) {
      type = images.length > 0 ? 'image_with_input' : 'numeric';
    } else if (images.length > 0) {
      type = 'image_based';
    } else if (questionText.length > 0) {
      type = 'text';
    }

    return {
      type,
      questionText,
      hasImage: images.length > 0,
      images,
      inputFields: inputs,
      choices,
      progress,
      timestamp: Date.now()
    };
  },

  /**
   * Check if we're on a question page (not task list or other pages)
   */
  isQuestionPage() {
    // Look for indicators of a question page
    const indicators = [
      // Submit button
      () => !!this.findSubmitButton(),
      // Input fields in question area
      () => MathParser.findInputFields().length > 0,
      // Multiple choice options
      () => MathParser.findChoices().length >= 2,
      // Question navigation (numbered circles)
      () => !!document.querySelector('[class*="question-nav"], [class*="questionNav"], [class*="StepNav"]'),
      // URL pattern
      () => /\/work\/|\/question\/|\/task\/.*\/\d+|\/problem\//i.test(window.location.href),
    ];

    return indicators.some(check => {
      try { return check(); } catch { return false; }
    });
  },

  /**
   * Find the submit/check button
   */
  findSubmitButton() {
    const buttonTexts = ['submit step', 'submit', 'check', 'check answer', 'submit answer'];
    const buttons = document.querySelectorAll('button');
    
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase().trim();
      if (buttonTexts.some(t => text?.includes(t))) {
        // Make sure button is visible and not disabled
        if (btn.offsetParent !== null && !btn.disabled) {
          return btn;
        }
      }
    }
    return null;
  },

  /**
   * Check if the question has been answered correctly
   */
  detectFeedback() {
    const feedbackSelectors = [
      '[class*="correct"]',
      '[class*="incorrect"]',
      '[class*="Correct"]',
      '[class*="Incorrect"]',
      '[class*="feedback"]',
      '[class*="Feedback"]',
      '[data-testid*="feedback"]',
      '[class*="result"]',
      '[class*="Result"]',
    ];

    for (const selector of feedbackSelectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('correct') && !text.includes('incorrect')) {
          return { type: 'correct', element: el };
        }
        if (text.includes('incorrect') || text.includes('wrong') || text.includes('try again')) {
          return { type: 'incorrect', element: el };
        }
      }
    }

    // Check for green/red color indicators
    const colorElements = document.querySelectorAll('[style*="color"], [style*="background"]');
    for (const el of colorElements) {
      const style = el.getAttribute('style') || '';
      if (style.includes('green') || style.includes('#4caf50') || style.includes('#34a853') || style.includes('rgb(76, 175, 80)')) {
        return { type: 'correct', element: el };
      }
      if (style.includes('red') || style.includes('#f44336') || style.includes('#ea4335')) {
        return { type: 'incorrect', element: el };
      }
    }

    return null;
  },

  /**
   * Check if the task is complete
   */
  isTaskComplete() {
    const completionIndicators = [
      'task complete',
      'well done',
      'all questions completed',
      'you have completed',
      'finished',
      'congratulations',
      'task finished',
    ];

    const pageText = document.body.textContent?.toLowerCase() || '';
    return completionIndicators.some(indicator => pageText.includes(indicator));
  },

  /**
   * Get the question area bounding rect for screenshot cropping
   */
  getQuestionBounds() {
    const containerSelectors = [
      '[data-testid="question-container"]',
      '[class*="QuestionContainer"]',
      '[class*="questionContainer"]',
      '[class*="question-content"]',
      '[class*="QuestionContent"]',
      '[class*="ProblemContainer"]',
      'main',
      '[role="main"]',
    ];

    for (const selector of containerSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 50) {
          return {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: rect.width,
            height: rect.height
          };
        }
      }
    }

    // Default to viewport
    return {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }
};

window.Detector = Detector;
