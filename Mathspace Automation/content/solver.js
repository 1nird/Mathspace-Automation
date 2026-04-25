// ============================================================
// Mathspace Auto Solver — Solver (AI Integration)
// Sends questions to Gemini and parses answers
// ============================================================

const Solver = {
  async solve(questionData) {
    try {
      const screenshotResult = await this.solveWithScreenshot(questionData);
      if (screenshotResult && !screenshotResult.error) return screenshotResult;
    } catch (err) {
      console.warn('[MAS] Screenshot solve failed:', err);
    }
    if (questionData.questionText) {
      try {
        return await this.solveWithText(questionData);
      } catch (err) {
        console.error('[MAS] Text solve failed:', err);
      }
    }
    return { error: 'Could not solve question' };
  },

  async solveWithScreenshot(questionData) {
    const { screenshot } = await this.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
    if (!screenshot) return { error: 'Failed to capture screenshot' };

    let context = '';
    if (questionData.questionText) context += `Question: ${questionData.questionText}\n`;
    if (questionData.type === 'multiple_choice' && questionData.choices.length > 0) {
      context += 'MULTIPLE CHOICE options:\n';
      questionData.choices.forEach(c => { context += `  ${c.letter}) ${c.text}\n`; });
    }
    if (questionData.inputFields.length > 0) {
      context += `Input fields to fill: ${questionData.inputFields.length}\n`;
      questionData.inputFields.forEach((f, i) => {
        if (f.placeholder) context += `  Field ${i + 1}: "${f.placeholder}"\n`;
      });
    }

    const result = await this.sendMessage({
      type: 'SOLVE_SCREENSHOT',
      screenshot,
      context
    });

    if (result.error) {
      if (result.rateLimited) { await this.delay(5000); return this.solveWithScreenshot(questionData); }
      return result;
    }
    return this.parseAnswer(result.answer, questionData);
  },

  async solveWithText(questionData) {
    const result = await this.sendMessage({
      type: 'SOLVE_TEXT',
      questionText: questionData.questionText,
      questionType: questionData.type
    });
    if (result.error) {
      if (result.rateLimited) { await this.delay(5000); return this.solveWithText(questionData); }
      return result;
    }
    return this.parseAnswer(result.answer, questionData);
  },

  parseAnswer(rawAnswer, questionData) {
    if (!rawAnswer) return { error: 'Empty answer from AI' };
    let answer = rawAnswer
      .replace(/^(answer|solution|result|the answer is)[\s:=]*/i, '')
      .replace(/\*\*/g, '').replace(/^\s*[-•]\s*/, '').trim();

    const answers = answer.includes('|||')
      ? answer.split('|||').map(a => a.trim()) : [answer];

    if (questionData.type === 'multiple_choice') {
      return {
        success: true, type: 'multiple_choice',
        answers, matchedChoice: this.matchChoice(answer, questionData.choices),
        raw: rawAnswer
      };
    }
    return { success: true, type: 'input', answers, raw: rawAnswer };
  },

  matchChoice(answer, choices) {
    if (!choices || choices.length === 0) return null;
    const clean = answer.toLowerCase().trim();

    // Exact match
    for (const c of choices) {
      if (c.text.toLowerCase().trim() === clean) return c;
    }
    // Letter match
    const lm = clean.match(/^([a-d])\)?\.?\s*/i);
    if (lm) {
      const idx = lm[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < choices.length) return choices[idx];
    }
    // Contains match
    for (const c of choices) {
      if (c.text.toLowerCase().includes(clean) || clean.includes(c.text.toLowerCase())) return c;
    }
    // Fuzzy match
    let best = null, bestScore = 0;
    for (const c of choices) {
      const score = this.similarity(clean, c.text.toLowerCase());
      if (score > bestScore && score > 0.3) { bestScore = score; best = c; }
    }
    return best;
  },

  similarity(a, b) {
    const wa = new Set(a.split(/\s+/));
    const wb = new Set(b.split(/\s+/));
    const inter = new Set([...wa].filter(w => wb.has(w)));
    const union = new Set([...wa, ...wb]);
    return union.size > 0 ? inter.size / union.size : 0;
  },

  sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp || {});
      });
    });
  },

  delay(ms) { return new Promise(r => setTimeout(r, ms)); }
};

window.Solver = Solver;
