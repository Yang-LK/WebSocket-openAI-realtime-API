const ws = new WebSocket('ws://localhost:3000');

// 取得DOM元素
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

let currentAIMessage = '';
let currentAudioTranscript = '';
let audioBuffer = [];
let isPlaying = false;

// 開啟後執行的動作
ws.onopen = () => {
    console.log('開啟連接')
    addMessage('系統', '已連接到聊天室', 'received');
}

// 關閉後執行的動作
ws.onclose = () => {
    console.log('關閉連接')
    addMessage('系統', '已斷開連接', 'received');
}

// 接收 Server 發送的訊息
ws.onmessage = async event => {
    console.log('接收到的原始數據:', event.data);

    let message;
    if (event.data instanceof Blob) {
        // 處理 Blob 數據
        try {
            const text = await event.data.text();
            message = JSON.parse(text);
        } catch (error) {
            console.error('無法解析 Blob 數據:', error);
            return;
        }
    } else {
        // 處理文本數據
        try {
            message = JSON.parse(event.data);
        } catch (error) {
            console.error('無法解析消息為 JSON:', error);
            return;
        }
    }

    console.log('解析後的消息:', message);

    // 處理解析後的消息
    switch (message.type) {
        case 'session.created':
            console.log('新聊天已創建:', message.session);
            break;
        case 'response.created':
            console.log('response.created');
            break;
        case 'rate_limits.updated':
            console.log('rate_limits.updated');
            break;
        case 'response.output_item.added':
        case 'conversation.item.created':
            console.log('conversation.item.created');
            break;
        case 'response.content_part.added':
            console.log('response.content_part.added');
            break;
        case 'response.text.delta':
            if (message.delta) {
                currentAIMessage += message.delta;
                updateLastAIMessage(currentAIMessage);
            }
            break;
        case 'response.text.done':
            console.log('response.text.done');
            break;
        case 'response.content_part.done':
        case 'response.output_item.done':
            console.log('response.output_item.done');
            break;
        case 'response.done':
            console.log('response.done');
            currentAIMessage = '';
            break;
        case 'response.audio_transcript.delta':
            if (message.delta) {
                currentAudioTranscript += message.delta;
                console.log('音频转录更新:', currentAudioTranscript);
            }
            break;
        case 'response.audio.delta':
            if (message.chunk) {
                // 如果 chunk 是 Base64 編碼的字符串，需要先解碼
                const binaryString = atob(message.chunk);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioBuffer.push(bytes.buffer);
            }
            break;
        case 'response.audio.done':
            console.log('音频生成完成');
            playAudio();
            break;
        case 'response.audio_transcript.done':
            console.log('音频转录完成:', currentAudioTranscript);
            currentAudioTranscript = '';
            break;
        default:
            console.log('收到未處理的類型:', message.type);
    }
}

// 發送訊息
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({ 
            type: "response.create",
            response:{
                modalities: ["text", "audio"],
                instructions: message,
            } 
        }));
        addMessage('你', message, 'sent');
        messageInput.value = '';
    }
}

// 添加訊息到聊天視窗
function addMessage(sender, content, type) {
    if (typeof content !== 'string' || content.trim() === '') {
        console.error(`${sender} 发送了无效的消息:`, content);
        return;
    }
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);
    messageElement.textContent = `${sender}: ${content}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 更新最后一条AI消息
function updateLastAIMessage(content) {
    const lastMessage = chatMessages.lastElementChild;
    if (lastMessage && lastMessage.classList.contains('received')) {
        lastMessage.textContent = `AI: ${content}`;
    } else {
        addMessage('AI', content, 'received');
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 播放音频
function playAudio() {
    if (audioBuffer.length > 0) {
        const audioBlob = new Blob(audioBuffer, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // 創建新的音頻元素
        const audioElement = new Audio(audioUrl);
        audioElement.controls = true; // 添加控制條
        
        // 將音頻元素添加到頁面中
        document.body.appendChild(audioElement);
        
        // 播放音頻
        audioElement.play();

        audioElement.onended = () => {
            URL.revokeObjectURL(audioUrl);
            audioBuffer = [];
            document.body.removeChild(audioElement);
        };
    }
}

// 綁定發送按鈕點擊事件
sendButton.addEventListener('click', sendMessage);

// 綁定輸入框回車事件
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});