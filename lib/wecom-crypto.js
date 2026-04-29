const crypto = require("crypto");

function pkcs7Unpad(buf) {
  if (!buf.length) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

/**
 * @param {string} encodingAESKeyBase43 — 企业微信后台 EncodingAESKey（43 字符）
 * @param {string} encryptedBase64
 * @param {string} corpId — 企业 ID，用于校验尾缀
 */
function decryptWxMessage(encodingAESKeyBase43, encryptedBase64, corpId) {
  const key = Buffer.from(encodingAESKeyBase43 + "=", "base64");
  if (key.length !== 32) {
    throw new Error("invalid_encoding_aes_key");
  }
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, 16);
  const ciphertext = buf.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  decrypted = pkcs7Unpad(decrypted);
  const content = decrypted.subarray(16);
  if (content.length < 4) throw new Error("decrypt_too_short");
  const msgLen = content.readUInt32BE(0);
  const msg = content.subarray(4, 4 + msgLen).toString("utf8");
  const recvId = content.subarray(4 + msgLen).toString("utf8");
  if (corpId && recvId !== corpId) {
    throw new Error("corpid_mismatch");
  }
  return msg;
}

function verifyMsgSignature(token, timestamp, nonce, encrypt, signature) {
  const arr = [String(token), String(timestamp), String(nonce), String(encrypt)]
    .filter(Boolean)
    .sort();
  const hash = crypto.createHash("sha1").update(arr.join("")).digest("hex");
  return hash === String(signature);
}

function extractXmlCdata(tag, xml) {
  const re = new RegExp(
    `<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`,
    "i"
  );
  const m = xml.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m2 = xml.match(re2);
  return m2 ? m2[1] : null;
}

module.exports = {
  decryptWxMessage,
  verifyMsgSignature,
  extractXmlCdata,
};
