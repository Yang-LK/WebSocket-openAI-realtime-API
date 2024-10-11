const ws = new WebSocket('ws://localhost:3000');

// 取得DOM元素
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const voiceButton = document.getElementById('voiceButton');

let currentAIMessage = '';
let currentAudioTranscript = '';
let audioBuffer = [];
let mediaRecorder;
let audiodeltas = [];
let audioDeltas = []; // 用于存储所有的音频delta

// 開啟後執行的動作
ws.onopen = () => {
    console.log('開啟連接');
    addMessage('系統', '已連接到聊天室', 'received');
}

// 關閉後執行的動作
ws.onclose = () => {
    console.log('關閉連接');
    addMessage('系統', '已斷開連接', 'received');
}

// 接收 Server 發送的訊息
ws.onmessage = event => {
    // console.log('接收到的原始數據:', event.data);

    const message = JSON.parse(event.data);
    console.log('解析後的消息:', message);

    // 處理解析後的消息
    switch (message.type) {
        case 'session.created':
            console.log('新聊天已創建:', message.session);
            break;
        case 'response.created':
        case 'rate_limits.updated':
        case 'conversation.item.created':
        case 'response.content_part.added':
            console.log(message.type);
            break;
        case 'response.text.delta':
            if (message.delta) {
                currentAIMessage += message.delta;
                updateLastAIMessage(currentAIMessage);
            }
            break;
        case 'response.text.done':
        case 'response.content_part.done':
        case 'response.output_item.done':
            console.log(message.type);
            break;
        case 'response.done':
            console.log('response.done');
            currentAIMessage = '';
            break;
        case 'response.audio_transcript.delta':
            if (message.delta) {
                currentAudioTranscript += message.delta;
                console.log('音频转录更新:', currentAudioTranscript);
                updateAITranscript(currentAudioTranscript);
            }
            break;
        case 'response.audio.delta':
            if (message.delta) {
                console.log('Received audio delta');
                audioDeltas.push(message.delta);
            }
            break;
        case 'response.audio.done':
            console.log('音频生成完成');
            console.log('audioDeltas', audioDeltas);
            createAndPlayAudio();
            break;
        case 'response.audio_transcript.done':
            console.log('音频转录完成:', currentAudioTranscript);
            addMessage('AI', currentAudioTranscript, 'received');
            currentAudioTranscript = '';
            break;
        default:
            console.log('收到未處理的類型:', message.type);
    }
}

// 录音功能
voiceButton.addEventListener('click', toggleRecording);

function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audiodeltas = [];

        mediaRecorder.ondataavailable = (event) => {
            audiodeltas.push(event.data);
        };

        mediaRecorder.onstop = sendAudioMessage;

        mediaRecorder.start();
        voiceButton.textContent = '停止录音';
    } catch (err) {
        console.error('录音失败:', err);
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        voiceButton.textContent = '开始录音';
    }
}

function sendAudioMessage() {
    const audioBlob = new Blob(audiodeltas, { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);

    // 在聊天室中添加音频元素
    addAudioMessage('你', audioUrl);

    // 将音频发送到服务器
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_audio",
                        data: base64Audio
                    }
                ]
            }
        }));
        // 发送 response.create 事件来触发 AI 的响应
        ws.send(JSON.stringify({
            type: "response.create",
            response: {
                modalities: ["text", "audio"]
            }
        }));
    };
    reader.readAsDataURL(audioBlob);
}

// 添加音频消息到聊天窗口
function addAudioMessage(sender, audioUrl, isAI = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isAI ? 'received' : 'sent');

    const senderSpan = document.createElement('span');
    senderSpan.textContent = `${sender}: `;
    messageElement.appendChild(senderSpan);

    const audioElement = document.createElement('audio');
    audioElement.src = audioUrl;
    audioElement.controls = true;
    messageElement.appendChild(audioElement);

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 发送文字消息
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "text",
                        text: message
                    }
                ]
            }
        }));
        ws.send(JSON.stringify({
            type: "response.create",
            response: {
                modalities: ["text", "audio"]
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

// 绑定发送按钮点击事件
sendButton.addEventListener('click', sendMessage);

// 绑定输入框回车事件
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 新的函数用于创建和播放音频
function createAndPlayAudio() {
    if (audioDeltas.length > 0) {
        console.log('Creating audio from', audioDeltas.length, 'deltas');
        
        // 将所有 base64 编码的音频数据合并成一个字符串
        const mergedBase64 = audioDeltas.join('');
        console.log('Merged base64 length:', mergedBase64.length);

        // 转换为 Float32Array
        const float32Array = base64ToFloat32Array(mergedBase64);

        // 转换为 16-bit PCM
        const pcmBuffer = floatTo16BitPCM(float32Array);

        // 创建 WAV 文件
        const wavBlob = createWavFile(pcmBuffer);

        const audioUrl = URL.createObjectURL(wavBlob);
        console.log('Audio URL:', audioUrl);

        // 创建音频元素并播放
        const audioElement = new Audio(audioUrl);
        audioElement.oncanplaythrough = () => {
            console.log('Audio can play through');
            audioElement.play().catch(e => console.error('Failed to play audio:', e));
        };
        audioElement.onerror = (e) => {
            console.error('Audio error:', e);
            console.error('Audio error code:', audioElement.error.code);
            console.error('Audio error message:', audioElement.error.message);
        };

        // 添加音频消息到聊天窗口
        addAudioMessage('AI', audioUrl, true);

        // 清空音频数据
        audioDeltas = [];
    } else {
        console.log('No audio data to play');
    }
}

// 新增的辅助函数
function base64ToFloat32Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
}

function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
}

function createWavFile(audioData, sampleRate = 44100) {
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + audioData.byteLength, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, audioData.byteLength, true);

    return new Blob([wavHeader, audioData], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// 更新AI音频转录文本
function updateAITranscript(transcript) {
    const lastMessage = chatMessages.lastElementChild;
    if (lastMessage && lastMessage.classList.contains('ai-transcript')) {
        lastMessage.textContent = `AI 音频转录: ${transcript}`;
    } else {
        const transcriptElement = document.createElement('div');
        transcriptElement.classList.add('message', 'received', 'ai-transcript');
        transcriptElement.textContent = `AI 音频转录: ${transcript}`;
        chatMessages.appendChild(transcriptElement);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}