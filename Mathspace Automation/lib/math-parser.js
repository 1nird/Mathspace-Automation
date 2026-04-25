// ============================================================
// Mathspace Auto Solver — Math Parser
// Extracts mathematical text from Mathspace's DOM
// ============================================================

const MathParser = {
  /**
   * Extract clean text from a DOM element, handling MathJax/LaTeX
   */
  extractText(element) {
    if (!element) return '';
    
    // Try to find LaTeX source first (most reliable)
    const latexScripts = element.querySelectorAll('script[type="math/tex"], script[type="math/tex; mode=display"]');
    if (latexScripts.length > 0) {
      let text = '';
      element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.tagName === 'SCRIPT' && node.type?.includes('math/tex')) {
          text += ` ${node.textContent} `;
        } else if (node.querySelector) {
          const innerLatex = node.querySelectorAll('script[type="math/tex"]');
          if (innerLatex.length > 0) {
            innerLatex.forEach(s => { text += ` ${s.textContent} `; });
          } else {
            text += node.textContent;
          }
        }
      });
      return this.cleanText(text);
    }

    // Try MathJax rendered elements
    const mathJaxElements = element.querySelectorAll('.MathJax, .MathJax_Display, .mjx-chtml, .mjx-math');
    if (mathJaxElements.length > 0) {
      let text = element.textContent || '';
      return this.cleanText(text);
    }

    // Try KaTeX elements
    const katexElements = element.querySelectorAll('.katex, .katex-html');
    if (katexElements.length > 0) {
      // KaTeX stores the original LaTeX in annotation elements
      const annotations = element.querySelectorAll('annotation[encoding="application/x-tex"]');
      if (annotations.length > 0) {
        let text = '';
        element.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          } else if (node.querySelector) {
            const ann = node.querySelector('annotation[encoding="application/x-tex"]');
            if (ann) {
              text += ` ${ann.textContent} `;
            } else {
              text += node.textContent;
            }
          }
        });
        return this.cleanText(text);
      }
      return this.cleanText(element.textContent);
    }

    // Fallback: just get text content
    return this.cleanText(element.textContent);
  },

  /**
   * Clean up extracted text
   */
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
      .replace(/\n\s*\n/g, '\n')
      .trim();
  },

  /**
   * Extract all text from the question area
   */
  extractQuestionText() {
    // Try various selectors that Mathspace might use for the question body
    const selectors = [
      '[data-testid="question-body"]',
      '[data-testid="question-content"]',
      '.question-body',
      '.question-content',
      '.problem-content',
      '.task-content',
      '[class*="QuestionBody"]',
      '[class*="questionBody"]',
      '[class*="ProblemContent"]',
      '[class*="question-text"]',
      // Generic fallbacks — try to find the main content area
      'main [class*="question"]',
      'main [class*="problem"]',
      '[role="main"] [class*="question"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return this.extractText(el);
      }
    }

    // Last resort: grab all visible text from the main content area
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (main) {
      return this.extractText(main);
    }

    return '';
  },

  /**
   * Find all input fields in the current question
   */
  findInputFields() {
    const inputs = [];
    
    // Standard text inputs
    document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])').forEach(input => {
      // Filter out search/navigation inputs
      if (input.closest('nav, header, [role="navigation"], [role="search"]')) return;
      if (input.closest('[class*="question"], [class*="problem"], [class*="answer"], main')) {
        inputs.push({
          element: input,
          type: 'input',
          placeholder: input.placeholder || '',
          currentValue: input.value || ''
        });
      }
    });

    // Textareas
    document.querySelectorAll('textarea').forEach(textarea => {
      if (textarea.closest('nav, header')) return;
      inputs.push({
        element: textarea,
        type: 'textarea',
        placeholder: textarea.placeholder || '',
        currentValue: textarea.value || ''
      });
    });

    // ContentEditable divs (Mathspace may use these for math input)
    document.querySelectorAll('[contenteditable="true"]').forEach(editable => {
      if (editable.closest('nav, header')) return;
      inputs.push({
        element: editable,
        type: 'contenteditable',
        placeholder: '',
        currentValue: editable.textContent || ''
      });
    });

    // MathQuill / custom math input fields
    document.querySelectorAll('.mq-editable-field, .mq-textarea textarea, [class*="math-input"], [class*="mathInput"]').forEach(field => {
      inputs.push({
        element: field,
        type: 'mathquill',
        placeholder: '',
        currentValue: field.textContent || field.value || ''
      });
    });

    return inputs;
  },

  /**
   * Find multiple choice options
   */
  findChoices() {
    const choices = [];
    
    const choiceSelectors = [
      '[data-testid*="choice"]',
      '[data-testid*="option"]',
      '[class*="choice"]',
      '[class*="option"]',
      '[class*="Choice"]',
      '[class*="Option"]',
      '[role="radio"]',
      '[role="option"]',
      'label:has(input[type="radio"])',
      '.answer-option',
      '[class*="answerOption"]',
      '[class*="MultipleChoice"] > *',
    ];

    for (const selector of choiceSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length >= 2) { // Multiple choice needs at least 2 options
        elements.forEach((el, index) => {
          choices.push({
            element: el,
            text: this.extractText(el),
            index: index,
            letter: String.fromCharCode(65 + index) // A, B, C, D...
          });
        });
        break; // Use the first selector that finds options
      }
    }

    return choices;
  },

  /**
   * Check if the current question contains images/diagrams
   */
  findImages() {
    const images = [];
    const questionArea = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    
    questionArea.querySelectorAll('img').forEach(img => {
      // Skip tiny icons and UI images
      if (img.naturalWidth < 50 || img.naturalHeight < 50) return;
      if (img.closest('nav, header, button, [role="navigation"]')) return;
      // Skip icons/logos
      if (img.src?.includes('icon') || img.src?.includes('logo') || img.src?.includes('avatar')) return;
      
      images.push({
        element: img,
        src: img.src,
        alt: img.alt || '',
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    });

    // Also check for SVG diagrams
    questionArea.querySelectorAll('svg').forEach(svg => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        images.push({
          element: svg,
          type: 'svg',
          width: rect.width,
          height: rect.height
        });
      }
    });

    return images;
  },

  /**
   * Get the current step/question number info
   */
  getProgressInfo() {
    const info = {
      currentStep: null,
      totalSteps: null,
      currentQuestion: null,
      totalQuestions: null
    };

    // Look for numbered navigation circles at the top
    const navButtons = document.querySelectorAll('[class*="question-nav"] button, [class*="questionNav"] button, [class*="StepNav"] button, [class*="step-nav"] button');
    if (navButtons.length > 0) {
      info.totalQuestions = navButtons.length;
      navButtons.forEach((btn, i) => {
        if (btn.classList.contains('active') || btn.getAttribute('aria-current') === 'true' || btn.getAttribute('aria-selected') === 'true') {
          info.currentQuestion = i + 1;
        }
      });
    }

    // Try to extract from text like "Question 3 of 16"
    const pageText = document.body.textContent;
    const match = pageText.match(/(?:question|step|problem)\s+(\d+)\s+(?:of|\/)\s+(\d+)/i);
    if (match) {
      info.currentQuestion = parseInt(match[1]);
      info.totalQuestions = parseInt(match[2]);
    }

    return info;
  }
};

// Make available globally for other content scripts
window.MathParser = MathParser;
