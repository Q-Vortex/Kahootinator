// == Fixed Kahoot Answer Highlighter (improved stability) ==
// Paste into browser console on kahoot.it

(() => {
  if (window.__kahootHighlighterLoaded) {
    console.log('Kahoot highlighter: already running.');
    return;
  }
  window.__kahootHighlighterLoaded = true;

  /* ------------------ Settings ------------------ */
  const REFRESH_AFTER_MS = 500;
  const HIGHLIGHT_CLASS = 'kahoot-correct-highlight';
  const API_TIMEOUT = 5000; // 5 секунд таймаут для API
  const MAX_RETRIES = 2; // Максимум попыток запроса
  const DEBOUNCE_DELAY = 500; // Увеличен дебаунс

  /* ------------------ Extract quizId from URL ------------------ */
  function extractQuizId() {
    const url = window.location.href;
    console.log('Current URL:', url);
    
    const patterns = [
      /quizId=([a-f0-9-]+)/i,
      /quiz-id=([a-f0-9-]+)/i,
      /\/challenge\/([a-f0-9-]+)/i,
      /\/[a-f0-9-]+$/i
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log('✅ Found quizId:', match[1]);
        return match[1];
      }
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const possibleIds = [
      urlParams.get('quizId'),
      urlParams.get('quiz-id'),
      urlParams.get('quiz_id')
    ];
    
    for (const id of possibleIds) {
      if (id && /^[a-f0-9-]+$/i.test(id)) {
        console.log('✅ Found quizId in params:', id);
        return id;
      }
    }
    
    console.error('❌ Could not extract quizId from URL:', url);
    return null;
  }

  /* ------------------ API URL Construction ------------------ */
  function getApiUrl() {
    const quizId = extractQuizId();
    if (!quizId) {
      console.error('No quizId found, cannot construct API URL');
      return null;
    }
    return `https://kahoot.it/rest/kahoots/${quizId}`;
  }

  /* ------------------ Utilities ------------------ */
  function normalizeText(s) {
    if (!s) return '';
    return s
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim()
      .toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           el.offsetParent !== null;
  }

  function findQuestionText() {
    const selectors = [
      '[data-functional-selector="question-title"]',
      '[data-functional-selector="block-title"]',
      '.question__Title',
      '[class*="question"][class*="title"]',
      '[class*="Question"][class*="Title"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) {
        const text = el.textContent.trim();
        if (text.length > 5) return text;
      }
    }

    const candidates = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
      .filter(el => isVisible(el) && el.textContent.trim().length > 10);

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.textContent.length - a.textContent.length);
      return candidates[0].textContent.trim();
    }

    return '';
  }

  function findAnswerButtons() {
    const buttons = [];

    const answerButtons = document.querySelectorAll(
      '[data-functional-selector="answer-button"], ' +
      '[data-functional-selector*="answer"], ' +
      'button[class*="answer"], ' +
      'button[class*="choice"]'
    );

    answerButtons.forEach(btn => {
      if (isVisible(btn)) {
        const textEl = btn.querySelector('[class*="text"], [class*="Text"], span, div');
        const text = textEl ? textEl.textContent.trim() : btn.textContent.trim();

        if (text.length > 0) {
          buttons.push({ element: btn, text: text });
        }
      }
    });

    if (buttons.length === 0) {
      const allButtons = document.querySelectorAll('button[type="button"]');
      allButtons.forEach(btn => {
        if (isVisible(btn) && btn.textContent.trim().length > 0) {
          const text = btn.textContent.trim();
          if (!text.match(/^(next|skip|continue|ok)$/i)) {
            buttons.push({ element: btn, text: text });
          }
        }
      });
    }

    console.log('Found answer buttons:', buttons.map(b => b.text));
    return buttons;
  }

  /* ------------------ API Fetch with Timeout ------------------ */
  async function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async function fetchKahootData(retryCount = 0) {
    const API_URL = getApiUrl();
    if (!API_URL) {
      console.error('Cannot fetch data: no API URL');
      return null;
    }

    try {
      console.log(`Fetching from: ${API_URL} (attempt ${retryCount + 1})`);
      const resp = await fetchWithTimeout(API_URL, { credentials: 'include' });
      
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
      }
      
      const json = await resp.json();
      console.log('✅ Data fetched successfully');
      return json;
    } catch (err) {
      console.warn(`Kahoot fetch failed (attempt ${retryCount + 1}):`, err.message);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchKahootData(retryCount + 1);
      }
      
      console.error('❌ All retry attempts failed');
      return null;
    }
  }

  function buildQuestionMap(kahootData) {
    const map = new Map();
    if (!kahootData || !Array.isArray(kahootData.questions)) return map;

    kahootData.questions.forEach(q => {
      const qText = q.question || q.prompt || q.title || '';
      const normalizedQ = normalizeText(qText);
      if (!normalizedQ) return;

      const corrects = [];
      if (Array.isArray(q.choices)) {
        q.choices.forEach((choice, idx) => {
          const chText = choice.answer || choice.choice || choice.text || choice.title || '';
          const isCorrect = choice.correct === true ||
                          choice.isCorrect === true ||
                          choice.correctAnswer === true ||
                          (Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.includes(idx)) ||
                          q.correctIndex === idx;

          if (isCorrect && chText) {
            corrects.push(normalizeText(chText.toString()));
          }
        });
      }

      map.set(normalizedQ, Array.from(new Set(corrects)));
    });

    console.log('Question map built:', Array.from(map.entries()));
    return map;
  }

  /* ------------------ Highlighting ------------------ */
  function removeExistingHighlights() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
      el.classList.remove(HIGHLIGHT_CLASS);
      el.style.boxShadow = '';
      el.style.border = '';
      el.removeAttribute('data-kahoot-processed');

      const indicator = el.querySelector('[data-kahoot-indicator="true"]');
      if (indicator) indicator.remove();
    });

    document.querySelectorAll('.kahoot-answer-overlay').forEach(n => n.remove());
  }

  function highlightElement(el) {
    if (!el || el.getAttribute('data-kahoot-processed') === '1') return;

    const indicator = document.createElement('div');
    indicator.setAttribute('data-kahoot-indicator', 'true');
    indicator.textContent = '•';
    Object.assign(indicator.style, {
      position: 'absolute',
      top: '2px',
      right: '2px',
      color: 'rgba(0,200,0,0.4)',
      fontSize: '24px',
      fontWeight: 'bold',
      zIndex: '99999',
      pointerEvents: 'none',
      lineHeight: '1',
    });

    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }

    el.appendChild(indicator);
    el.setAttribute('data-kahoot-processed', '1');
  }

  function matchAnswers(questionText, correctAnswers) {
    if (!correctAnswers || correctAnswers.length === 0) return false;

    const buttons = findAnswerButtons();
    if (buttons.length === 0) return false;

    let matched = false;
    const normalizedCorrects = correctAnswers.map(normalizeText);

    console.log('Matching against correct answers:', normalizedCorrects);

    buttons.forEach(({ element, text }) => {
      const normalizedBtn = normalizeText(text);
      console.log('Checking button:', normalizedBtn);

      for (const correct of normalizedCorrects) {
        if (normalizedBtn === correct) {
          console.log('✓ Exact match found:', text);
          highlightElement(element);
          matched = true;
          break;
        }

        if (normalizedBtn.includes(correct) || correct.includes(normalizedBtn)) {
          console.log('✓ Partial match found:', text);
          highlightElement(element);
          matched = true;
          break;
        }

        const cleanedBtn = normalizedBtn.replace(/^[a-z0-9]\s+/, '');
        if (cleanedBtn === correct || cleanedBtn.includes(correct) || correct.includes(cleanedBtn)) {
          console.log('✓ Match after cleaning:', text);
          highlightElement(element);
          matched = true;
          break;
        }
      }
    });

    return matched;
  }

  function showAnswerOverlay(questionText, corrects) {
    document.querySelectorAll('.kahoot-answer-overlay').forEach(n => n.remove());

    const overlay = document.createElement('div');
    overlay.className = 'kahoot-answer-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '50px',
      right: '20px',
      background: 'rgba(255, 255, 255, 0.95)',
      color: '#000',
      padding: '15px',
      borderRadius: '8px',
      zIndex: '100000',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      fontFamily: 'Arial, sans-serif',
      maxWidth: '300px'
    });

    overlay.innerHTML = `
      <div style="margin-top: 8px; font-size: 13px;">
        ${corrects.map(c => `<div style="margin: 4px 0;">• ${c}</div>`).join('')}
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 8000);
  }

  /* ------------------ Main Logic ------------------ */
  let kahootCache = null;
  let questionMap = null;
  let lastQuestion = null;
  let isProcessing = false;

  async function processCurrentQuestion() {
    if (!window.__kahoot_highlight_enabled || isProcessing) {
      return;
    }

    const questionText = findQuestionText();
    if (!questionText) {
      console.log('No question text found');
      return;
    }

    const normalizedQ = normalizeText(questionText);
    if (!normalizedQ || normalizedQ === lastQuestion) return;

    console.log('Processing question:', questionText);
    
    isProcessing = true;
    lastQuestion = normalizedQ;

    try {
      if (!kahootCache) {
        kahootCache = await fetchKahootData();
        if (!kahootCache) {
          console.error('Failed to fetch kahoot data');
          return;
        }
        questionMap = buildQuestionMap(kahootCache);
      }

      let corrects = questionMap.get(normalizedQ);

      if (!corrects) {
        for (const [qText, answers] of questionMap.entries()) {
          if (normalizedQ.includes(qText) || qText.includes(normalizedQ)) {
            corrects = answers;
            console.log('Found partial question match');
            break;
          }
        }
      }

      setTimeout(() => {
        removeExistingHighlights();
        const matched = matchAnswers(questionText, corrects);

        if (!matched && corrects && corrects.length > 0) {
          console.log('Could not match buttons, showing overlay');
          showAnswerOverlay(questionText, corrects);
        }
      }, REFRESH_AFTER_MS);
    } catch (error) {
      console.error('Error processing question:', error);
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, 1000);
    }
  }

  /* ------------------ DOM Observer ------------------ */
  const observer = new MutationObserver((mutations) => {
    if (!window.__kahoot_highlight_enabled) return;

    const hasScriptChanges = mutations.some(mutation => {
      return Array.from(mutation.addedNodes).some(node => 
        node.nodeType === 1 && 
        (node.hasAttribute('data-kahoot-indicator') || 
         node.classList?.contains('kahoot-answer-overlay'))
      );
    });
    
    if (hasScriptChanges) return;
    
    if (window.__kahoot_debounce) clearTimeout(window.__kahoot_debounce);
    window.__kahoot_debounce = setTimeout(processCurrentQuestion, DEBOUNCE_DELAY);
  });

  /* ------------------ Start ------------------ */
  function start() {
    const quizId = extractQuizId();
    if (!quizId) {
      console.error('❌ Not a valid Kahoot solo page. Please navigate to a Kahoot solo game first.');
      return;
    }

    window.__kahoot_highlight_enabled = true;
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: false
    });

    setTimeout(processCurrentQuestion, 1000);
    console.log('✅ Kahoot highlighter started with improved stability');
  }

  start();
})();