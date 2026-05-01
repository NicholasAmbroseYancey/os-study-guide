// ─── State ────────────────────────────────────────────────────────────────────

let randomQueue = [];
let currentRandomIdx = 0;
let answerHistory = [];
let totalQuestions = 0;
let correctCount = 0;
let incorrectCount = 0;
let lastRandomBtn = null;

// ─── Answer Checking Utilities ────────────────────────────────────────────────

function normalize(s) {
    return (s || '').toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[-_–—\.\,\'\"\(\)\[\]]+/g, '');
}

function splitCorrectTokens(correct) {
    return correct.toString().split(/\s*(?:,|\/|\band\b)\s*/i).map(t => t.trim()).filter(Boolean);
}

function answersMatch(userInputs, correctString, synonyms) {
    const correctTokens = splitCorrectTokens(correctString);

    // Single input for a multi-token answer lets the user type everything in one box
    if (userInputs.length === 1 && correctTokens.length > 1) {
        const joined = userInputs.map(u => u.trim()).join(' and ').toLowerCase();
        if (normalize(joined) === normalize(correctString)) return true;
        if (Array.isArray(synonyms) && synonyms.some(s => normalize(s) === normalize(joined))) return true;
        return false;
    }

    if (userInputs.length !== correctTokens.length) return false;

    for (let i = 0; i < correctTokens.length; i++) {
        const userVal = (userInputs[i] || '').trim().toLowerCase();
        const corr = correctTokens[i].trim().toLowerCase();
        const alts = corr.split(/\s*(?:\/|\|)\s*/).map(a => a.trim()).filter(Boolean);
        const normUser = normalize(userVal);

        let matched = alts.some(a => normalize(a) === normUser);

        if (!matched && Array.isArray(synonyms)) {
            if (synonyms[i]) {
                const s = synonyms[i];
                if (Array.isArray(s)) {
                    matched = s.some(alt => normalize(alt) === normUser);
                } else if (typeof s === 'string') {
                    matched = normalize(s) === normUser;
                }
            }
        }

        if (!matched && Array.isArray(synonyms)) {
            const flatFull = synonyms.every(x => typeof x === 'string');
            if (flatFull) {
                const joinedUser = userInputs.map(u => u.trim()).join(' and ');
                if (synonyms.some(s => normalize(s) === normalize(joinedUser))) matched = true;
            }
        }

        if (!matched) return false;
    }
    return true;
}

// ─── Random Mode ─────────────────────────────────────────────────────────────

function showRandomControls(btnElement) {
    lastRandomBtn = btnElement;
    const modal = document.getElementById('random-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (btnElement) btnElement.classList.add('active');
    setTimeout(() => {
        const slider = document.getElementById('count-slider');
        if (slider) slider.focus();
    }, 60);
}

function hideRandomControls() {
    const modal = document.getElementById('random-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (lastRandomBtn) lastRandomBtn.classList.remove('active');
    lastRandomBtn = null;
}

function startRandomConfirmed() {
    startRandom(lastRandomBtn);
}

function startRandom(btnElement) {
    // Build full pool and shuffle
    randomQueue = [];
    for (const chap in database) {
        database[chap].forEach(q => randomQueue.push(q));
    }
    for (let i = randomQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [randomQueue[i], randomQueue[j]] = [randomQueue[j], randomQueue[i]];
    }

    // Respect user-selected count
    const totalAvailable = randomQueue.length;
    const inputEl = document.getElementById('count-input');
    let desired = parseInt(inputEl && inputEl.value, 10);
    if (!desired || desired <= 0 || desired > totalAvailable) desired = totalAvailable;
    randomQueue = randomQueue.slice(0, desired);

    currentRandomIdx = 0;
    correctCount = 0;
    incorrectCount = 0;
    totalQuestions = randomQueue.length;
    answerHistory = Array.from({ length: totalQuestions }, () => ({ user: [], status: 'unanswered' }));

    document.querySelectorAll('.chapter-menu > button').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    hideRandomControls();
    showRandomQuestion();
}

function showRandomQuestion() {
    const container = document.getElementById('quiz-container');
    const item = randomQueue[currentRandomIdx];

    let qFormatted = item.q;
    let count = 0;
    while (qFormatted.includes('[BLANK]')) {
        qFormatted = qFormatted.replace('[BLANK]', `<input type="text" id="ans-rand-${count}" onkeypress="checkRandom(event)">`);
        count++;
    }

    container.innerHTML = `
        <div class="card">
            <div class="progress-wrap">
                <div class="progress" aria-hidden><i id="progress-bar"></i></div>
                <div class="counters" id="counters">0 / 0 — Correct: 0 Incorrect: 0</div>
            </div>
            <div class="q-text">${qFormatted}</div>
            <div style="margin-top:8px;">
                <button class="close" onclick="toggleFixAnswerRandom()">Fix Answer</button>
                <div id="fix-editor-rand" class="hidden" style="margin-top:8px;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:12px;">
                <button class="prev-btn" onclick="prevRandom()">&#9664; Previous</button>
                <div style="flex:1"></div>
                <div id="action-rand" class="action-container hidden">
                    <button class="next-btn" onclick="nextRandom()">Next Question &#9654;</button>
                </div>
            </div>
            <div id="fb-rand" style="font-weight:bold; margin-top:10px;"></div>
            <div id="hint-rand" class="hidden"></div>
        </div>`;

    const hist = answerHistory[currentRandomIdx];
    if (hist && hist.user && hist.user.length) {
        hist.user.forEach((v, i) => {
            const el = document.getElementById(`ans-rand-${i}`);
            if (el) el.value = v;
        });
        const fb = document.getElementById('fb-rand');
        const hint = document.getElementById('hint-rand');
        if (hist.status === 'correct') {
            document.querySelectorAll('[id^="ans-rand-"]').forEach(i => i.className = 'correct');
            fb.innerText = '✓ Correct';
            fb.style.color = 'var(--secondary-color)';
            hint.classList.add('hidden');
            document.getElementById('action-rand').classList.remove('hidden');
        } else if (hist.status === 'incorrect') {
            document.querySelectorAll('[id^="ans-rand-"]').forEach(i => i.className = 'incorrect');
            fb.innerText = '✗ Incorrect';
            fb.style.color = 'var(--error-color)';
            hint.innerHTML = `<div class="hint">Correct Answer: <b>${item.a}</b></div>`;
            hint.classList.remove('hidden');
            document.getElementById('action-rand').classList.remove('hidden');
        }
    }

    updateProgressUI();
    setTimeout(() => {
        const first = document.getElementById('ans-rand-0');
        if (first) first.focus();
    }, 60);
}

function checkRandom(e) {
    if (e.key !== 'Enter') return;

    const item = randomQueue[currentRandomIdx];
    const inputs = document.querySelectorAll('[id^="ans-rand-"]');
    const feedback = document.getElementById('fb-rand');
    const action = document.getElementById('action-rand');
    const hint = document.getElementById('hint-rand');
    const was = answerHistory[currentRandomIdx] || { status: 'unanswered' };

    if (was.status === 'unanswered') {
        const userVals = Array.from(inputs).map(i => i.value);
        const isCorrect = answersMatch(userVals, item.a, item.synonyms);

        if (isCorrect) correctCount++; else incorrectCount++;
        answerHistory[currentRandomIdx] = { user: Array.from(inputs).map(i => i.value), status: isCorrect ? 'correct' : 'incorrect' };

        if (isCorrect) {
            inputs.forEach(i => i.className = 'correct');
            feedback.innerText = '✓ Correct';
            feedback.style.color = 'var(--secondary-color)';
            hint.classList.add('hidden');
        } else {
            inputs.forEach(i => i.className = 'incorrect');
            feedback.innerText = '✗ Incorrect';
            feedback.style.color = 'var(--error-color)';
            hint.innerHTML = `<div class="hint">Correct Answer: <b>${item.a}</b></div>`;
            hint.classList.remove('hidden');
        }
        action.classList.remove('hidden');
        updateProgressUI();
    } else {
        nextRandom();
    }
}

function nextRandom() {
    currentRandomIdx++;
    if (currentRandomIdx < randomQueue.length) {
        showRandomQuestion();
    } else {
        document.getElementById('quiz-container').innerHTML = `
            <div class="card" style="text-align:center;">
                <h2>Set Complete!</h2>
                <div style="margin-top:8px; color:#bbb">Correct: ${correctCount} — Incorrect: ${incorrectCount}</div>
                <div style="margin-top:12px;"><button onclick="location.reload()">Start Over</button></div>
            </div>`;
    }
}

function prevRandom() {
    if (currentRandomIdx === 0) return;
    currentRandomIdx--;
    showRandomQuestion();
}

function updateProgressUI() {
    const bar = document.getElementById('progress-bar');
    const counters = document.getElementById('counters');
    if (!bar || !counters) return;
    const pct = Math.round((currentRandomIdx / Math.max(1, totalQuestions)) * 100);
    bar.style.width = pct + '%';
    counters.innerText = `${currentRandomIdx + 1} / ${totalQuestions} — Correct: ${correctCount} Incorrect: ${incorrectCount}`;
}

// ─── Fix Answer Editors ───────────────────────────────────────────────────────

function toggleFixAnswerRandom() {
    const editor = document.getElementById('fix-editor-rand');
    if (!editor) return;
    const item = randomQueue[currentRandomIdx];
    if (!item) return;
    if (editor.classList.contains('hidden')) {
        editor.innerHTML = `<div>
            <div style="color:#bbb;font-size:0.85rem;margin-bottom:4px;">Correct answer:</div>
            <input id="fix-input-rand" type="text" style="width:100%;padding:8px;background:#000;color:var(--text-color);border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;">
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
                <button class="close" onclick="toggleFixAnswerRandom()">Cancel</button>
                <button onclick="saveFixAnswerRandom()" style="background:var(--secondary-color);border:none;padding:6px 10px;border-radius:6px;font-weight:700;color:#000;">Save</button>
            </div>
        </div>`;
        document.getElementById('fix-input-rand').value = item.a;
        editor.classList.remove('hidden');
    } else {
        editor.classList.add('hidden');
    }
}

function saveFixAnswerRandom() {
    const input = document.getElementById('fix-input-rand');
    if (!input) return;
    const newAnswer = input.value.trim();
    if (!newAnswer) return;
    const item = randomQueue[currentRandomIdx];
    if (!item) return;
    item.a = newAnswer;
    if (item._chap !== undefined && item._idx !== undefined) {
        database[item._chap][item._idx].a = newAnswer;
        localStorage.setItem(`answerFix_${item._chap}_${item._idx}`, newAnswer);
    }
    document.getElementById('fix-editor-rand').classList.add('hidden');
    const hint = document.getElementById('hint-rand');
    if (hint && !hint.classList.contains('hidden')) {
        hint.innerHTML = `<div class="hint">Correct Answer: <b>${newAnswer}</b></div>`;
    }
}

function toggleFixAnswerChapter(chap, idx) {
    const editor = document.getElementById(`fix-editor-${chap}-${idx}`);
    if (!editor) return;
    const item = database[chap][idx];
    if (!item) return;
    if (editor.classList.contains('hidden')) {
        editor.innerHTML = `<div>
            <div style="color:#bbb;font-size:0.85rem;margin-bottom:4px;">Correct answer:</div>
            <input id="fix-input-${chap}-${idx}" type="text" style="width:100%;padding:8px;background:#000;color:var(--text-color);border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;">
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
                <button class="close" onclick="toggleFixAnswerChapter(${chap}, ${idx})">Cancel</button>
                <button onclick="saveFixAnswerChapter(${chap}, ${idx})" style="background:var(--secondary-color);border:none;padding:6px 10px;border-radius:6px;font-weight:700;color:#000;">Save</button>
            </div>
        </div>`;
        document.getElementById(`fix-input-${chap}-${idx}`).value = item.a;
        editor.classList.remove('hidden');
    } else {
        editor.classList.add('hidden');
    }
}

function saveFixAnswerChapter(chap, idx) {
    const input = document.getElementById(`fix-input-${chap}-${idx}`);
    if (!input) return;
    const newAnswer = input.value.trim();
    if (!newAnswer) return;
    const item = database[chap][idx];
    if (!item) return;
    item.a = newAnswer;
    localStorage.setItem(`answerFix_${chap}_${idx}`, newAnswer);
    document.getElementById(`fix-editor-${chap}-${idx}`).classList.add('hidden');
    const hint = document.getElementById(`hint-${chap}-${idx}`);
    if (hint && !hint.classList.contains('hidden')) {
        hint.innerHTML = `Correct Answer: <b>${newAnswer}</b>`;
    }
}

function applyAnswerFixes() {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const match = key.match(/^answerFix_(.+)_(\ d+)$/);
        if (match) {
            const chap = match[1];
            const idx = parseInt(match[2]);
            if (database[chap] && database[chap][idx]) {
                database[chap][idx].a = localStorage.getItem(key);
            }
        }
    }
}

// ─── Count Control (Random modal) ────────────────────────────────────────────

function initCountControl() {
    const totalAvailable = Object.keys(database).reduce((s, k) => s + database[k].length, 0);
    const slider = document.getElementById('count-slider');
    const input = document.getElementById('count-input');
    if (!slider || !input) return;
    slider.max = totalAvailable;
    slider.value = totalAvailable;
    input.value = totalAvailable;

    slider.addEventListener('input', () => { input.value = slider.value; });
    input.addEventListener('change', () => {
        let v = parseInt(input.value, 10) || 1;
        v = Math.max(1, Math.min(v, totalAvailable));
        input.value = v;
        slider.value = v;
    });
}

// ─── Chapter Mode ─────────────────────────────────────────────────────────────

function loadChapter(chapterNum, btnElement) {
    document.querySelectorAll('.chapter-menu > button').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const modal = document.getElementById('random-modal');
    if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');

    const container = document.getElementById('quiz-container');
    const questions = database[chapterNum];

    container.innerHTML = questions.map((item, idx) => {
        let qFormatted = item.q;
        let count = 0;
        while (qFormatted.includes('[BLANK]')) {
            qFormatted = qFormatted.replace('[BLANK]', `<input type="text" id="ans-${chapterNum}-${idx}-${count}" onkeypress="handleCheck(event, ${chapterNum}, ${idx})">`);
            count++;
        }
        return `
        <div class="card">
            <div class="q-text"><strong>#${idx + 1}</strong> — ${qFormatted}</div>
            <div style="margin-top:8px;">
                <button class="close" onclick="toggleFixAnswerChapter(${chapterNum}, ${idx})">Fix Answer</button>
                <div id="fix-editor-${chapterNum}-${idx}" class="hidden" style="margin-top:8px;"></div>
            </div>
            <div id="fb-${chapterNum}-${idx}" style="font-weight:bold; margin-top:10px;"></div>
            <div id="hint-${chapterNum}-${idx}" class="hint hidden">Correct Answer: <b>${item.a}</b></div>
        </div>`;
    }).join('');
}

function handleCheck(e, chap, idx) {
    if (e.key !== 'Enter') return;

    const feedback = document.getElementById(`fb-${chap}-${idx}`);
    const hint = document.getElementById(`hint-${chap}-${idx}`);
    const inputs = document.querySelectorAll(`[id^="ans-${chap}-${idx}-"]`);
    const userValues = Array.from(inputs).map(i => i.value);

    if (answersMatch(userValues, database[chap][idx].a, database[chap][idx].synonyms)) {
        inputs.forEach(i => i.className = 'correct');
        feedback.innerText = '✓ Correct';
        feedback.style.color = 'var(--secondary-color)';
        hint.classList.add('hidden');
    } else {
        inputs.forEach(i => i.className = 'incorrect');
        feedback.innerText = '✗ Incorrect';
        feedback.style.color = 'var(--error-color)';
        hint.classList.remove('hidden');
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initCountControl();
    mergeSynonymsIntoDatabase();
    // Tag each item with its chapter and index so Fix Answer can identify it in random mode
    for (const chap in database) {
        database[chap].forEach((item, idx) => {
            item._chap = chap;
            item._idx = idx;
        });
    }
    applyAnswerFixes();
});
