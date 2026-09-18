// Connect to the Socket.IO server
const socket = io();

// State variables
let currentRole = 'user'; // 'user', 'admin', 'mod'
let userData = {};
let currentRoom = null;
let replyingTo = null;
let typingTimeout = null;

// --- Screen Management ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function toggleAdminLogin() {
    const userFields = document.getElementById('user-login-fields');
    const adminFields = document.getElementById('admin-login-fields');
    
    if (userFields.style.display === 'none') {
        userFields.style.display = 'block';
        adminFields.style.display = 'none';
    } else {
        userFields.style.display = 'none';
        adminFields.style.display = 'block';
    }
}

// --- Login & Matching ---
function startChat(type) {
    if (type === 'user') {
        const nick = document.getElementById('nickname').value.trim();
        const campus = document.getElementById('campus-select').value;
        
        if (!nick || !campus) return alert("Please enter a nickname and select a campus.");
        
        userData = { name: nick, campus: campus, role: 'user' };
    } 
    // If staff, role and name are already set during loginStaff()
    
    showScreen('chat-screen');
    resetChatUI();
    socket.emit('find_match', userData);
}

function loginStaff() {
    const name = document.getElementById('staff-name').value.trim();
    const pass = document.getElementById('staff-pass').value;
    
    // In production, NEVER hardcode passwords on the client. 
    // This sends a request to the server to verify.
    socket.emit('staff_login', { name, pass }, (response) => {
        if (response.success) {
            userData = { name: name, campus: 'Admin Console', role: response.role };
            showScreen('admin-dashboard');
        } else {
            alert(response.message);
        }
    });
}

function quitSession() {
    socket.emit('leave_match');
    showScreen('login-screen');
    currentRoom = null;
}

function skipMatch() {
    socket.emit('leave_match');
    resetChatUI();
    document.getElementById('match-info').innerHTML = "Finding a partner...";
    socket.emit('find_match', userData);
}

function resetChatUI() {
    document.getElementById('chat-window').innerHTML = '';
    document.getElementById('message-input').value = '';
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('report-btn').style.display = 'none';
    cancelReply();
    addSystemMessage("Searching for a partner...");
}

// --- Real-time Socket Events ---

socket.on('online_count', (count) => {
    document.getElementById('landing-online-count').innerText = count;
    document.getElementById('chat-online-count').innerText = count;
    document.getElementById('dash-online-count').innerText = count;
});

socket.on('match_found', (data) => {
    currentRoom = data.roomId;
    document.getElementById('match-info').innerHTML = `Matched: <b>${data.partner.name}</b> <span style="color:#888;">(${data.partner.campus})</span>`;
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('report-btn').style.display = 'block';
    
    document.getElementById('chat-window').innerHTML = '';
    addSystemMessage("You are now connected. Say hi!");
});

socket.on('stranger_disconnected', () => {
    addSystemMessage("Your chat partner has left the session.");
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('report-btn').style.display = 'none';
});

socket.on('receive_message', (msgData) => {
    appendMessage(msgData, 'received');
});

socket.on('partner_typing', (isTyping) => {
    const indicator = document.getElementById('typing-indicator');
    indicator.innerText = isTyping ? "Partner is typing..." : "";
});

socket.on('receive_reaction', (data) => {
    const msgDiv = document.getElementById(`msg-${data.msgId}`);
    if(msgDiv) {
        let reactSpan = msgDiv.querySelector('.reaction-display');
        if(!reactSpan) {
            reactSpan = document.createElement('span');
            reactSpan.className = 'reaction-display';
            reactSpan.style = "position:absolute; bottom:-10px; right:10px; font-size:1.2rem; background:black; border-radius:50%;";
            msgDiv.appendChild(reactSpan);
        }
        reactSpan.innerText = data.emoji;
    }
});

// --- Messaging Logic ---
function getPHTime() {
    const options = { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true };
    return new Intl.DateTimeFormat('en-US', options).format(new Date());
}

function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

function handleTyping() {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1500);
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !currentRoom) return;

    const msgId = Date.now().toString();
    const msgData = {
        id: msgId,
        text: text,
        time: getPHTime(),
        sender: userData,
        replyTo: replyingTo
    };

    socket.emit('send_message', msgData);
    appendMessage(msgData, 'sent');
    
    input.value = '';
    socket.emit('typing', false);
    cancelReply();
}

// --- UI Rendering ---
function addSystemMessage(text) {
    const chat = document.getElementById('chat-window');
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function appendMessage(msgData, type) {
    const chat = document.getElementById('chat-window');
    
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${type}`;
    wrapper.id = `msg-${msgData.id}`;
    
    // Tag generation based on role
    let tagHTML = `<span class="timestamp">${msgData.time}</span>`;
    let bubbleClass = 'bubble-normal';
    
    if (msgData.sender.role === 'admin') {
        tagHTML = `<span class="neon-text staff-badge">👑 ADMIN</span> <span class="timestamp">${msgData.time}</span>`;
        bubbleClass = 'bubble-staff';
    } else if (msgData.sender.role === 'mod') {
        tagHTML = `<span class="neon-text staff-badge">📢 MOD</span> <span class="timestamp">${msgData.time}</span>`;
        bubbleClass = 'bubble-staff';
    }

    // Handle Replies
    let replyHTML = '';
    if (msgData.replyTo) {
        replyHTML = `<div style="background:#000; padding:5px; border-left:2px solid var(--neon-green); margin-bottom:5px; font-size:0.75rem; border-radius:5px;">
            <span style="color:var(--muted-gray);">Replying to:</span><br>
            ${msgData.replyTo}
        </div>`;
    }

    wrapper.innerHTML = `
        <div class="meta-tag">${tagHTML}</div>
        <div class="chat-bubble ${bubbleClass}">
            ${replyHTML}
            ${msgData.text}
            <div class="reaction-menu">
                <span class="reaction-emoji" onclick="sendReaction('${msgData.id}', '❤️')">❤️</span>
                <span class="reaction-emoji" onclick="sendReaction('${msgData.id}', '😂')">😂</span>
                <span class="reaction-emoji" onclick="sendReaction('${msgData.id}', '👍')">👍</span>
            </div>
        </div>
    `;

    // Swipe to reply (Double click for mouse users)
    const bubble = wrapper.querySelector('.chat-bubble');
    bubble.addEventListener('dblclick', () => setReply(msgData.text));
    
    // Long press for reaction (Simulated with contextmenu/right-click)
    bubble.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        wrapper.querySelector('.reaction-menu').classList.toggle('active');
    });

    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
}

// --- Features ---
function setReply(text) {
    replyingTo = text;
    document.getElementById('reply-text').innerText = text.length > 30 ? text.substring(0, 30) + '...' : text;
    document.getElementById('reply-preview').classList.add('active');
    document.getElementById('message-input').focus();
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('reply-preview').classList.remove('active');
}

function sendReaction(msgId, emoji) {
    socket.emit('send_reaction', { msgId, emoji });
    // Hide menu locally
    document.getElementById(`msg-${msgId}`).querySelector('.reaction-menu').classList.remove('active');
    // Display locally
    let msgDiv = document.getElementById(`msg-${msgId}`);
    let reactSpan = msgDiv.querySelector('.reaction-display');
    if(!reactSpan) {
        reactSpan = document.createElement('span');
        reactSpan.className = 'reaction-display';
        reactSpan.style = "position:absolute; bottom:-10px; right:10px; font-size:1.2rem; background:black; border-radius:50%;";
        msgDiv.appendChild(reactSpan);
    }
    reactSpan.innerText = emoji;
}

function reportUser() {
    if(confirm("Report this user for inappropriate behavior?")) {
        socket.emit('report_user');
        alert("Report sent to moderators.");
        skipMatch(); // Auto skip after reporting
    }
          }
