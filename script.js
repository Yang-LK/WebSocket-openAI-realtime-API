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
    const message = JSON.parse(event.data);
    console.log('收到的完整消息:', message);

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
                console.log('收到的文本增量:', message.delta);
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
        case 'response.output_item.added':
            console.log('收到新的輸出項:', message);
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

    // 使用 FileReader 直接讀取 Blob 數據為 ArrayBuffer
    const reader = new FileReader();
    reader.onloadend = async () => {
        try {
            // 獲取 ArrayBuffer
            const arrayBuffer = reader.result;

            // 使用 AudioContext 解碼音頻數據
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // 重採樣到 24kHz
            const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 24000, 24000);
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            const resampled24kBuffer = await offlineContext.startRendering();

            // 將 AudioBuffer 轉換為 Int16Array
            const pcm16Data = new Int16Array(resampled24kBuffer.length);
            const channelData = resampled24kBuffer.getChannelData(0);
            for (let i = 0; i < channelData.length; i++) {
                pcm16Data[i] = Math.max(-32768, Math.min(32767, Math.round(channelData[i] * 32767)));
            }

            // 將 Int16Array 轉換為 base64
            const base64AudioData = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16Data.buffer)));

            console.log('處理後的 base64AudioData 長度:', base64AudioData.length);

            // 發送音頻數據到服務器
            ws.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [
                        {
                            type: "input_audio",
                            audio: base64AudioData
                        }
                    ]
                }
            }));

            // 發送 response.create 請求
            ws.send(JSON.stringify({
                type: "response.create",
                response: {
                    modalities: ["text", "audio"],
                    instructions: "使用中文回答",
                    voice: "alloy",
                    output_audio_format: "pcm16",
                    temperature: 0.7
                }
            }));

            // 在聊天室中添加音頻元素
            const audioUrl = URL.createObjectURL(audioBlob);
            addAudioMessage('你', audioUrl);
        } catch (error) {
            console.error('處理音頻時發生錯誤:', error);
        }
    };
    reader.readAsArrayBuffer(audioBlob);
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
    let message = messageInput.value.trim();
    if (message) {       
        ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: message
                    }
                ]
            }
        }));
        // The voice the model uses to respond - one of alloy, echo, or shimmer.
        ws.send(JSON.stringify({
            type: "response.create",
            response: {
                modalities: ["text", "audio"],
                instructions: "Please assist the user in Traditional Chinese.",
                voice: "alloy",
                output_audio_format: "pcm16",
                tools: [
                    {
                        type: "function",
                        name: "calculate_sum",
                        description: "Calculates the sum of two numbers.",
                        parameters: {
                            type: "object",
                            properties: {
                                a: { type: "number" },
                                b: { type: "number" }
                            },
                            required: ["a", "b"]
                        }
                    }
                ],
                tool_choice: "auto",
                temperature: 0.7
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
    if (typeof content !== 'string' || content.trim() === '') {
        console.warn('嘗試更新無效的 AI 消息內容:', content);
        return;
    }
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

// 修改 createAndPlayAudio 函數
function createAndPlayAudio() {
    if (audioDeltas.length > 0) {
        console.log('創建音頻，來自', audioDeltas.length, '個 delta');
        
        // 將所有 base64 編碼的音頻數據轉換為 Float32Array 並合併
        const audioArrays = audioDeltas.map(delta => wavtools.base64ToFloat32Array(delta));
        const mergedAudioData = wavtools.mergeFloat32Arrays(audioArrays);
        console.log('合併後的音頻數據長度:', mergedAudioData.length);

        // 使用固定的採樣率
        const sampleRate = 26500 ;
        const numChannels = 1; // 假設為單聲道

        // 創建 WAV 文件
        const wavFile = wavtools.createWaveFileData(mergedAudioData, sampleRate, numChannels);
        const wavBlob = new Blob([wavFile], { type: 'audio/wav' });

        const audioUrl = URL.createObjectURL(wavBlob);
        console.log('音頻 URL:', audioUrl);

        // 創建音頻元素並播放
        const audioElement = new Audio(audioUrl);
        audioElement.oncanplaythrough = () => {
            console.log('音頻可以播放');
            audioElement.play().catch(e => console.error('無法播放音頻:', e));
        };
        audioElement.onerror = (e) => {
            console.error('音頻錯誤:', e);
            console.error('音頻錯誤代碼:', audioElement.error.code);
            console.error('音頻錯誤信息:', audioElement.error.message);
        };

        // 添加音頻消息到聊天窗口
        addAudioMessage('AI', audioUrl, true);

        // 清空音頻數據
        audioDeltas = [];
    } else {
        console.log('沒有音頻數據可播放');
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
