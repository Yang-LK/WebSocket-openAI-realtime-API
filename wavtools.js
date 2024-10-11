// wavtools.js

const wavtools = {
  // 創建 WAV 文件數據
  createWaveFileData: function(samples, sampleRate, numChannels) {
    const dataSize = samples.length * 2; // 16-bit 音頻
    const fileSize = 44 + dataSize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // 寫入 WAV 文件頭
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM 格式
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // 寫入音頻數據
    this.floatTo16BitPCM(view, 44, samples);

    return buffer;
  },

  // 將浮點數音頻數據轉換為 16-bit PCM
  floatTo16BitPCM: function(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  },

  // 將字符串寫入 DataView
  writeString: function(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  },

  // 修改 base64ToFloat32Array 函數
  base64ToFloat32Array: function(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // 假設接收到的是 16 位整數 PCM 數據
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      // 將 16 位整數轉換為 -1.0 到 1.0 之間的浮點數
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  },

  // 合併多個 Float32Array
  mergeFloat32Arrays: function(arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  },

  // 添加一個新函數來檢測採樣率
  detectSampleRate: function(audioData, duration) {
    return Math.round(audioData.length / duration);
  }
};

// 如果在 Node.js 環境中，導出 wavtools 對象
if (typeof module !== 'undefined' && module.exports) {
  module.exports = wavtools;
}