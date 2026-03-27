// Notebook App Logic
let currentUser = null;
let currentQueue = [];
let currentCard = null;
let sessionTotalCards = 0;
let currentDrawIndex = 0;
let sessionMasteredCards = [];

function getStudents() {
    return JSON.parse(localStorage.getItem('vocabStudents')) || {};
}
function saveStudents(data) {
    localStorage.setItem('vocabStudents', JSON.stringify(data));
}

const screens = {
    login: document.getElementById('login-screen'),
    dashboard: document.getElementById('dashboard-screen'),
    flashcard: document.getElementById('flashcard-screen'),
    finished: document.getElementById('finished-screen')
};
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

// --- Login Screen ---
const nameInput = document.getElementById('student-name');
const profileList = document.getElementById('profile-list');

function renderProfileList() {
    const students = getStudents();
    profileList.innerHTML = '';
    Object.keys(students).forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'profile-chip';
        chip.onclick = () => {
            nameInput.value = name;
            handleLogin();
        };
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = name;

        const delBtn = document.createElement('span');
        delBtn.className = 'delete-profile-btn';
        delBtn.innerHTML = '&times;';
        delBtn.title = '刪除使用者';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`確定要刪除使用者 "${name}" 嗎？此動作無法復原。`)) {
                delete students[name];
                saveStudents(students);
                renderProfileList();
            }
        };

        chip.appendChild(nameSpan);
        chip.appendChild(delBtn);
        profileList.appendChild(chip);
    });
}
function handleLogin() {
    const name = nameInput.value.trim();
    if (!name) return alert("請輸入姓名！");
    let students = getStudents();
    if (!students[name]) {
        students[name] = { vocab: [], queue: [] };
        saveStudents(students);
    }
    currentUser = name;
    document.getElementById('welcome-text').innerText = `歡迎，${name}！`;
    document.getElementById('current-student-name').innerText = name;
    updateDashboard();
    showScreen('dashboard');
}
document.getElementById('login-btn').onclick = handleLogin;
nameInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
renderProfileList();


// --- Dashboard Screen ---
const uploadBtn = document.getElementById('excel-upload');
const statusMsg = document.getElementById('upload-status');
const progressCard = document.getElementById('progress-card');
const vocabCountEl = document.getElementById('vocab-count');

function updateDashboard() {
    const students = getStudents();
    const data = students[currentUser];
    
    // Count unmastered cards (testPasses < 2)
    let unmasteredCount = 0;
    if(data.vocab && data.vocab.length > 0) {
        unmasteredCount = data.vocab.filter(v => v.testPasses < 2).length;
    }
    
    if (unmasteredCount > 0) {
        progressCard.style.display = 'block';
        vocabCountEl.innerText = unmasteredCount;
    } else {
        progressCard.style.display = 'none';
    }
}
document.getElementById('logout-btn').onclick = () => {
    currentUser = null; nameInput.value = '';
    renderProfileList(); showScreen('login');
};

// File Parsing
uploadBtn.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    statusMsg.innerText = "讀取中...";
    statusMsg.style.color = '#00b894';
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            let vocabList = [];
            for(let row of json) {
                const values = Object.values(row);
                if(values.length >= 2) {
                    let en = String(values[0]).trim();
                    let zh = String(values[1]).trim();
                    if(/[a-zA-Z]/.test(zh) && !/[a-zA-Z]/.test(en)) [en, zh] = [zh, en];
                    vocabList.push({ en, zh, testMode: false, testPasses: 0 });
                }
            }
            if (vocabList.length === 0) {
                statusMsg.innerText = "找不到合適資料";
                statusMsg.style.color = '#ff7675';
                return;
            }
            
            let students = getStudents();
            students[currentUser].vocab = vocabList;
            // Clear pending queues, we'll randomize dynamically
            students[currentUser].queue = []; 
            saveStudents(students);
            
            statusMsg.innerText = `成功載入 ${vocabList.length} 個單字！`;
            updateDashboard();
        } catch (error) {
            statusMsg.innerText = "解析失敗，請確認檔案格式";
            statusMsg.style.color = '#ff7675';
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
});

// START 30-card session
document.getElementById('start-btn').onclick = () => {
    let students = getStudents();
    let vocabList = students[currentUser].vocab;
    let savedQueue = students[currentUser].queue || [];
    
    // Filter out mastered cards from saved queue
    savedQueue = savedQueue.filter(idx => vocabList[idx] && vocabList[idx].testPasses < 2);
    
    // Find unmastered indices
    let unmastered = [];
    vocabList.forEach((v, i) => { if (v.testPasses < 2 && !savedQueue.includes(i)) unmastered.push(i); });
    
    unmastered.sort(() => Math.random() - 0.5); // Randomize
    
    // Take up to 30
    let fullQueue = savedQueue.concat(unmastered);
    currentQueue = fullQueue.slice(0, 30);
    sessionTotalCards = currentQueue.length;
    currentDrawIndex = 0;
    sessionMasteredCards = [];
    
    students[currentUser].queue = fullQueue.slice(sessionTotalCards);
    saveStudents(students);
    
    if(currentQueue.length > 0) {
        currentQueue.forEach(idx => {
            if (vocabList[idx].testPasses === 1) vocabList[idx].testMode = true;
            else vocabList[idx].testMode = false;
        });
        showNextCard();
        showScreen('flashcard');
    } else {
        alert("資料庫的單字已經全部背完囉，太厲害了！");
    }
};

// --- Show Mastered Words ---
const masteredModal = document.getElementById('mastered-modal');
const masteredListContainer = document.getElementById('mastered-list-container');
document.getElementById('view-mastered-btn').onclick = () => {
    let students = getStudents();
    let vocabList = students[currentUser].vocab || [];
    let mastered = vocabList.filter(v => v.testPasses >= 2);
    
    masteredListContainer.innerHTML = '';
    if(mastered.length === 0) {
        masteredListContainer.innerHTML = '<p style="text-align:center; padding: 20px;">目前還沒有精熟的單字喔，繼續加油！💪</p>';
    } else {
        mastered.forEach(card => {
            const row = document.createElement('div');
            row.className = 'mastered-item';
            row.innerHTML = `<span class="mastered-en">${card.en}</span><span class="mastered-zh">${card.zh}</span>`;
            masteredListContainer.appendChild(row);
        });
    }
    masteredModal.style.display = 'flex';
};
document.getElementById('close-modal-btn').onclick = () => {
    masteredModal.style.display = 'none';
};
const closeMasteredIcon = document.getElementById('close-mastered-icon');
if(closeMasteredIcon) closeMasteredIcon.onclick = () => { masteredModal.style.display = 'none'; };

// --- Show Format Help ---
const helpModal = document.getElementById('help-modal');
document.getElementById('help-btn').onclick = () => {
    helpModal.style.display = 'flex';
};
document.getElementById('close-help-btn').onclick = () => {
    helpModal.style.display = 'none';
};
const closeHelpIcon = document.getElementById('close-help-icon');
if(closeHelpIcon) closeHelpIcon.onclick = () => { helpModal.style.display = 'none'; };


// --- Flashcard & SRS Logic ---
const cardFront = document.getElementById('card-front');
const spellingContainer = document.getElementById('spelling-container');
const reactionControls = document.getElementById('reaction-controls');
const enEl = document.getElementById('word-en');
const zhEl = document.getElementById('word-zh');
const queueLengthEl = document.getElementById('queue-length');
const progressFill = document.getElementById('progress-fill');

const spellZHEl = document.getElementById('test-zh');
const spellInput = document.getElementById('spell-input');
const spellBtn = document.getElementById('check-spell-btn');
const spellFeedback = document.getElementById('spell-feedback');

window.speechUtterances = [];
let fallbackAudio = null;
function speak(text) {
    const isLine = /Line|MicroMessenger|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    
    if (isLine) {
        if (fallbackAudio) fallbackAudio.pause();
        fallbackAudio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`);
        const speedSelect = document.getElementById('speech-speed');
        if (speedSelect) fallbackAudio.playbackRate = parseFloat(speedSelect.value) || 1;
        fallbackAudio.play().catch(e => console.log('Audio fallback failed', e));
        return;
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        const speedSelect = document.getElementById('speech-speed');
        if (speedSelect) utterance.rate = parseFloat(speedSelect.value) || 1;
        
        // Prevent garbage collection in Android Webviews (like LINE)
        window.speechUtterances.push(utterance);
        utterance.onend = function() {
            const idx = window.speechUtterances.indexOf(utterance);
            if (idx > -1) window.speechUtterances.splice(idx, 1);
        };
        utterance.onerror = function() {
            const idx = window.speechUtterances.indexOf(utterance);
            if (idx > -1) window.speechUtterances.splice(idx, 1);
        };
        
        window.speechSynthesis.speak(utterance);
    }
}

// Unlock Web Speech API on first interaction (fixes audio in LINE / in-app browsers)
let speechUnlocked = false;
function unlockSpeech() {
    if (speechUnlocked) return;
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }
    speechUnlocked = true;
    document.removeEventListener('click', unlockSpeech);
    document.removeEventListener('touchstart', unlockSpeech);
}
document.addEventListener('click', unlockSpeech);
document.addEventListener('touchstart', unlockSpeech);
document.getElementById('audio-btn').onclick = (e) => { e.stopPropagation(); speak(currentCard.en); };
document.getElementById('back-btn').onclick = () => { updateDashboard(); showScreen('dashboard'); };

function updateProgress() {
    document.getElementById('current-question-num').innerText = currentDrawIndex;
    queueLengthEl.innerText = sessionTotalCards;
    
    let rawProgress = (currentDrawIndex / (sessionTotalCards || 1)) * 100;
    progressFill.style.width = `${Math.min(100, Math.max(0, rawProgress))}%`;
}

function showFinishedScreen() {
    let students = getStudents();
    let savedQueue = students[currentUser].queue || [];
    if (currentQueue && currentQueue.length > 0) {
        let leftover = currentQueue.filter((idx, pos) => currentQueue.indexOf(idx) === pos && students[currentUser].vocab[idx]?.testPasses < 2);
        students[currentUser].queue = leftover.concat(savedQueue);
    }
    saveStudents(students);

    updateDashboard();
    const listEl = document.getElementById('session-mastered-list');
    if (sessionMasteredCards.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;">本次沒有新增完全記住的單字<br>沒關係，多練習幾次就會了！💪</p>';
    } else {
        listEl.innerHTML = sessionMasteredCards.map(c => `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #ffdeeb; padding: 5px 0;">
                <span style="color: var(--primary-dark);">${c.en}</span>
                <span>${c.zh}</span>
            </div>
        `).join('');
    }
    showScreen('finished');
    
    setTimeout(() => {
        if(screens.finished.classList.contains('active')) {
            updateDashboard();
            showScreen('dashboard');
        }
    }, 2500);
}

function showNextCard() {
    if (currentQueue.length === 0 || currentDrawIndex >= sessionTotalCards) {
        showFinishedScreen();
        return;
    }
    
    currentDrawIndex++;
    updateProgress();
    
    let students = getStudents();
    let vocabList = students[currentUser].vocab;
    let cardIndex = currentQueue[0];
    currentCard = vocabList[cardIndex];
    currentCard.origIndex = cardIndex;
    
    if (currentCard.testMode) {
        cardFront.style.display = 'none';
        reactionControls.style.display = 'none';
        spellingContainer.style.display = 'block';
        spellZHEl.innerText = currentCard.zh;
        spellInput.value = '';
        spellFeedback.innerText = '';
        
        let textStr = currentCard.en.trim();
        let isSentence = textStr.includes(' ');
        let len = textStr.length;
        let baseSize = window.innerWidth <= 480 ? 0.65 : 1;
        
        if (isSentence) {
            if (len > 40) spellInput.style.fontSize = (1.8 * baseSize) + 'rem';
            else if (len > 20) spellInput.style.fontSize = (2.4 * baseSize) + 'rem';
            else spellInput.style.fontSize = (2.8 * baseSize) + 'rem';
        } else {
            if (len > 14) spellInput.style.fontSize = (2.2 * baseSize) + 'rem';
            else if (len > 10) spellInput.style.fontSize = (2.8 * baseSize) + 'rem';
            else spellInput.style.fontSize = (3.5 * baseSize) + 'rem';
        }
        
        spellInput.focus();
        speak(currentCard.en);
    } else {
        spellingContainer.style.display = 'none';
        cardFront.style.display = 'flex';
        reactionControls.style.display = 'flex';
        
        enEl.innerText = currentCard.en;
        let textStr = currentCard.en.trim();
        let isSentence = textStr.includes(' ');
        let len = textStr.length;
        let baseSize = window.innerWidth <= 480 ? 0.65 : 1;
        
        if (isSentence) {
            enEl.style.whiteSpace = 'normal';
            enEl.style.wordBreak = 'break-word';
            if (len > 40) enEl.style.fontSize = (1.8 * baseSize) + 'rem';
            else if (len > 20) enEl.style.fontSize = (2.4 * baseSize) + 'rem';
            else enEl.style.fontSize = (2.8 * baseSize) + 'rem';
        } else {
            enEl.style.whiteSpace = 'normal';
            enEl.style.wordBreak = 'break-word';
            if (len > 14) enEl.style.fontSize = (2.2 * baseSize) + 'rem';
            else if (len > 10) enEl.style.fontSize = (2.8 * baseSize) + 'rem';
            else enEl.style.fontSize = (3.5 * baseSize) + 'rem';
        }
        
        zhEl.innerText = currentCard.zh;
        speak(currentCard.en);
    }
}

// Reactions
document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.onclick = () => {
        const action = btn.dataset.action;
        let students = getStudents();
        let vocabList = students[currentUser].vocab;
        
        const currentIndex = currentQueue.shift();
        
        if (action === 'cry') {
            // 哭臉必須7次內再次出現
            const insertAt = Math.min(currentQueue.length, 6);
            currentQueue.splice(insertAt, 0, currentIndex);
        } else if (action === 'neutral') {
            // 沒表情則10次內再次出現
            const insertAt = Math.min(currentQueue.length, 9);
            currentQueue.splice(insertAt, 0, currentIndex);
        } else if (action === 'smile') {
            // 單字卡被點擊過笑臉才可以考學生 -> switch to testMode
            vocabList[currentIndex].testMode = true;
            currentQueue.push(currentIndex);
        }
        
        students[currentUser].vocab = vocabList;
        saveStudents(students);
        showNextCard();
    };
});

// Spelling
spellInput.addEventListener('focus', () => {
    document.querySelector('.main-card-area').classList.add('keyboard-open');
    setTimeout(() => {
        spellInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
});
spellInput.addEventListener('blur', () => {
    setTimeout(() => {
        document.querySelector('.main-card-area').classList.remove('keyboard-open');
    }, 150);
});

function verifySpelling() {
    const input = spellInput.value.trim().toLowerCase();
    const correctAns = currentCard.en.trim().toLowerCase();
    
    let students = getStudents();
    let vocabList = students[currentUser].vocab;
    let currentIndex = currentQueue.shift();
    
    if (input === correctAns) {
        spellFeedback.innerText = '答對了！✅';
        spellFeedback.className = 'feedback-success';
        speak("Correct");
        
        if (currentCard.testPasses === 0) {
            vocabList[currentIndex].testPasses = 1;
            vocabList[currentIndex].testMode = true;
            currentQueue.push(currentIndex);
        } else {
            vocabList[currentIndex].testPasses = 2; 
            sessionMasteredCards.push(currentCard);
        }
    } else {
        spellFeedback.innerText = `答錯了 ❌ 正確是: ${currentCard.en}`;
        spellFeedback.className = 'feedback-error';
        speak(currentCard.en);
        
        vocabList[currentIndex].testMode = false;
        vocabList[currentIndex].testPasses = 0;
        currentQueue.unshift(currentIndex);
    }
    
    students[currentUser].vocab = vocabList;
    saveStudents(students);
    
    spellBtn.disabled = true;
    setTimeout(() => {
        spellBtn.disabled = false;
        if (input !== correctAns) {
            currentDrawIndex--;
        }
        showNextCard();
    }, 1500);
}

spellBtn.onclick = verifySpelling;
spellInput.addEventListener('keypress', e => { if (e.key === 'Enter') verifySpelling(); });
document.getElementById('home-btn').onclick = () => { updateDashboard(); showScreen('dashboard'); };
