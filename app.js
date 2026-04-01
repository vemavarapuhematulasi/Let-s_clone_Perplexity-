document.addEventListener('DOMContentLoaded', () => {
  const mainInput = document.getElementById('mainInput');
  const chips = document.querySelectorAll('.chip');
  const modelSelector = document.getElementById('modelSelector');

  // Focus input on load
  mainInput.focus();

  // Handle chip clicks
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const action = chip.textContent.trim();
      mainInput.value = `Help me ${action.toLowerCase()}... `;
      mainInput.focus();
    });
  });

  // Simple model selector toggle (visual only for now)
  modelSelector.addEventListener('click', () => {
    const span = modelSelector.querySelector('span');
    if (span.textContent === 'Fast') {
      span.textContent = 'Creative';
    } else {
      span.textContent = 'Fast';
    }
  });

  const heroSection = document.getElementById('heroSection');
  const chatThread = document.getElementById('chatThread');
  const chatHistory = document.getElementById('chatHistory');

  const stickyInputArea = document.getElementById('stickyInputArea');

  async function startChat(query) {
    // Transition UI
    heroSection.style.display = 'none';
    chatThread.style.display = 'flex';
    
    const inputWrapper = document.querySelector('.chat-input-wrapper');
    stickyInputArea.appendChild(inputWrapper);
    inputWrapper.style.maxWidth = '100%';

    // Add user message
    addMessage(query, 'user');

    // Add loading indicator
    const loadingId = 'loading-' + Date.now();
    addMessage('Alpha is thinking...', 'ai loading', loadingId);

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      const loadingMsg = document.getElementById(loadingId);
      const contentDiv = loadingMsg.querySelector('.message-content');
      contentDiv.innerHTML = ''; 

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        fullText += decoder.decode(value, { stream: true });
        contentDiv.innerHTML = marked.parse(fullText);
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
      
      loadingMsg.classList.remove('loading');
      fetchHistory(); // Refresh sidebar history

      // Final step: Add the copy button once streaming is done
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copy</span>';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(contentDiv.innerText);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Copied!</span>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copy</span>';
          copyBtn.classList.remove('copied');
        }, 2000);
      };
      loadingMsg.appendChild(copyBtn);

    } catch (err) {
      document.getElementById(loadingId).textContent = "Alpha is offline. Please start the backend.";
    }
  }

  function addMessage(text, role, id = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (id) msgDiv.id = id;
    
    // Create the content container
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = text.startsWith('<') ? text : text; // Assume markdown if coming from streamer
    msgDiv.appendChild(content);

    // Add copy button for AI messages
    if (role.includes('ai') && !role.includes('loading')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copy</span>';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(content.innerText);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Copied!</span>';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Copy</span>';
          copyBtn.classList.remove('copied');
        }, 2000);
      };
      msgDiv.appendChild(copyBtn);
    }

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  const addBtn = document.getElementById('addBtn');
  const fileInput = document.getElementById('fileInput');

  // Trigger file selection on + button
  addBtn.addEventListener('click', () => fileInput.click());

  // Handle PDF Upload and RAG
  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('file', file);

      // Transition UI to chat if in hero mode
      if (heroSection.style.display !== 'none') {
        startChat(`[Analyzing Document: ${file.name}]`);
      }

      addMessage(`Uploading ${file.name}...`, 'ai loading', 'upload-loader');

      try {
        const res = await fetch('/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        const loader = document.getElementById('upload-loader');
        if (data.status === 'success') {
          loader.innerHTML = `<div class="message-content"><b>Alpha:</b> I've absorbed the contents of <u>${file.name}</u>. You can now ask me questions about its data.</div>`;
          loader.classList.remove('loading');
        } else {
          loader.textContent = "Error: " + data.error;
        }
      } catch (err) {
        addMessage("Failed to connect for upload.", "ai");
      }
    }
  });

  const sidebarHistory = document.getElementById('sidebarHistory');

  async function fetchHistory() {
    try {
      const res = await fetch('/history');
      const data = await res.json();
      renderHistorySidebar(data);
    } catch (err) {
      console.error("Failed to load history.");
    }
  }

  function renderHistorySidebar(history) {
    sidebarHistory.innerHTML = '';
    history.reverse().forEach(item => {
      const hItem = document.createElement('div');
      hItem.className = 'sidebar-history-item';
      hItem.innerText = item.query;
      hItem.title = item.date;
      hItem.onclick = () => showPastConversation(item);
      sidebarHistory.appendChild(hItem);
    });
  }

  function showPastConversation(item) {
    heroSection.style.display = 'none';
    chatThread.style.display = 'flex';
    chatHistory.innerHTML = '';
    addMessage(item.query, 'user');
    addMessage(marked.parse(item.response), 'ai');
    
    // Ensure input is at bottom
    stickyInputArea.appendChild(document.querySelector('.chat-input-wrapper'));
  }

  // Load history on start
  fetchHistory();

  const micBtn = document.getElementById('micBtn');

  // Voice Recognition (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    micBtn.addEventListener('click', () => {
      recognition.start();
      micBtn.style.color = '#ef4444'; // Red for recording
      micBtn.innerHTML = '<i class="fa-solid fa-microphone-lines animate-pulse"></i>';
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      mainInput.value = transcript;
      mainInput.focus();
    };

    recognition.onend = () => {
      micBtn.style.color = 'var(--text-secondary)';
      micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    };

    recognition.onerror = () => {
      micBtn.style.color = 'var(--text-secondary)';
      micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    };
  } else {
    micBtn.style.display = 'none'; // Hide if not supported
  }

  // Handle Enter key in input
  mainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && mainInput.value.trim() !== '') {
      const query = mainInput.value.trim();
      mainInput.value = '';
      startChat(query);
    }
  });
});
