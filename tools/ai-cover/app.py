#!/usr/bin/env python3
"""
AI 翻唱工具
==========
输入歌曲名称/歌手 + 新歌词 → 分离伴奏 → 提取旋律 → 合成新人声 → 混音输出 MP3

安装:
    pip install -r requirements.txt      # Python 依赖
    sudo apt install ffmpeg              # 系统依赖 (必须)
    pip install yt-dlp                   # 在线搜索歌曲 (可选)

运行:
    python app.py
    # 浏览器打开 http://localhost:7860
"""

import asyncio
import logging
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

import gradio as gr
import librosa
import numpy as np
import pyworld as pw
import soundfile as sf
from scipy.ndimage import uniform_filter1d
from scipy.signal import medfilt

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai-cover")

SR = 44100
FRAME_PERIOD_MS = 5.0

VOICES = {
    "晓晓 · 女声 (中文)": "zh-CN-XiaoxiaoNeural",
    "云希 · 男声 (中文)": "zh-CN-YunxiNeural",
    "云健 · 男声 (中文)": "zh-CN-YunjianNeural",
    "晓伊 · 女声 (中文)": "zh-CN-XiaoyiNeural",
    "Jenny · Female (EN)": "en-US-JennyNeural",
    "Guy · Male (EN)": "en-US-GuyNeural",
}


# ═══════════════════════════════════════════════════════════════════
#  Step 1 — 获取音频
# ═══════════════════════════════════════════════════════════════════


def _ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise EnvironmentError(
            "缺少 ffmpeg，请先安装: sudo apt install ffmpeg (Linux) "
            "/ brew install ffmpeg (macOS)"
        )


def _to_wav(src: Path, dst: Path):
    """Convert any audio format to mono WAV at target sample rate."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ar", str(SR), "-ac", "1", str(dst)],
        capture_output=True, check=True, timeout=120,
    )


def download_song(song_name: str, artist: str, work_dir: Path) -> Path:
    if shutil.which("yt-dlp") is None:
        raise EnvironmentError(
            "未安装 yt-dlp，无法在线搜索歌曲。请上传音频文件，"
            "或运行 pip install yt-dlp"
        )

    query = f"{song_name} {artist}".strip()
    log.info("yt-dlp 搜索: %s", query)

    subprocess.run(
        [
            "yt-dlp", f"ytsearch1:{query}",
            "-x", "--audio-format", "wav", "--audio-quality", "0",
            "-o", str(work_dir / "dl.%(ext)s"),
            "--no-playlist", "--no-warnings",
        ],
        capture_output=True, text=True, check=True, timeout=180,
    )

    wav = work_dir / "original.wav"
    for f in sorted(work_dir.glob("dl.*")):
        _to_wav(f, wav)
        break

    if not wav.exists():
        raise FileNotFoundError("下载成功但未找到音频文件")
    return wav


# ═══════════════════════════════════════════════════════════════════
#  Step 2 — 人声/伴奏分离 (Demucs)
# ═══════════════════════════════════════════════════════════════════


def separate_vocals(audio: Path, work_dir: Path) -> tuple[Path, Path]:
    out = work_dir / "separated"
    out.mkdir(exist_ok=True)

    log.info("Demucs 人声分离…")
    r = subprocess.run(
        [
            sys.executable, "-m", "demucs",
            "-n", "htdemucs", "--two-stems", "vocals",
            "--device", "cpu",
            "-o", str(out), str(audio),
        ],
        capture_output=True, text=True, timeout=900,
    )
    if r.returncode != 0:
        raise RuntimeError(f"Demucs 失败:\n{r.stderr[:600]}")

    base = out / "htdemucs" / audio.stem
    vocals = base / "vocals.wav"
    accomp = base / "no_vocals.wav"
    if not vocals.exists():
        raise FileNotFoundError("Demucs 输出文件未找到")
    return vocals, accomp


# ═══════════════════════════════════════════════════════════════════
#  Step 3 — 旋律/音高提取 (WORLD Vocoder)
# ═══════════════════════════════════════════════════════════════════


def extract_melody(vocals_path: Path) -> dict:
    log.info("提取旋律…")
    y, _ = librosa.load(str(vocals_path), sr=SR, mono=True)
    y64 = y.astype(np.float64)

    f0, t = pw.harvest(y64, SR, frame_period=FRAME_PERIOD_MS)
    sp = pw.cheaptrick(y64, f0, t, SR)
    ap = pw.d4c(y64, f0, t, SR)

    f0 = medfilt(f0, kernel_size=5).astype(np.float64)
    f0 = uniform_filter1d(f0, size=3)

    onset_env = librosa.onset.onset_strength(y=y, sr=SR)
    tempo = librosa.feature.tempo(onset_envelope=onset_env, sr=SR)[0]

    return dict(f0=f0, timeaxis=t, sp=sp, ap=ap,
                duration=len(y) / SR, tempo=tempo)


# ═══════════════════════════════════════════════════════════════════
#  Step 4 — 新人声合成 (Edge-TTS + WORLD pitch warp)
# ═══════════════════════════════════════════════════════════════════


def _tts_in_thread(text: str, path: str, voice: str):
    """Run edge-tts with its own event loop inside a thread."""
    import edge_tts

    async def _go():
        await edge_tts.Communicate(text, voice).save(path)

    asyncio.run(_go())


def synthesize_singing(
    lyrics: str, melody: dict, work_dir: Path, voice: str,
) -> Path:
    log.info("合成新人声…")
    tts_mp3 = work_dir / "tts.mp3"
    tts_wav = work_dir / "tts.wav"
    output  = work_dir / "new_vocals.wav"

    # ── TTS ──
    th = threading.Thread(target=_tts_in_thread,
                          args=(lyrics, str(tts_mp3), voice))
    th.start()
    th.join(timeout=120)
    if not tts_mp3.exists():
        raise RuntimeError("Edge-TTS 生成失败")

    _to_wav(tts_mp3, tts_wav)
    tts_y, _ = librosa.load(str(tts_wav), sr=SR, mono=True)

    # ── time-stretch to match original vocal duration ──
    orig_dur = melody["duration"]
    tts_dur  = len(tts_y) / SR

    if tts_dur > 0.1 and abs(tts_dur - orig_dur) / max(orig_dur, 0.1) > 0.05:
        rate = float(np.clip(tts_dur / orig_dur, 0.25, 4.0))
        tts_y = librosa.effects.time_stretch(tts_y, rate=rate)

    target_n = int(orig_dur * SR)
    if len(tts_y) >= target_n:
        tts_y = tts_y[:target_n]
    else:
        tts_y = np.pad(tts_y, (0, target_n - len(tts_y)))

    # ── WORLD analysis of stretched TTS ──
    t64 = tts_y.astype(np.float64)
    f0_tts, tt = pw.harvest(t64, SR, frame_period=FRAME_PERIOD_MS)
    sp_tts = pw.cheaptrick(t64, f0_tts, tt, SR)
    ap_tts = pw.d4c(t64, f0_tts, tt, SR)

    # ── resample original melody F0 onto TTS frame grid ──
    orig_f0 = melody["f0"]
    nf = len(f0_tts)
    if len(orig_f0) != nf:
        mapped = np.interp(
            np.linspace(0, 1, nf),
            np.linspace(0, 1, len(orig_f0)),
            orig_f0,
        )
    else:
        mapped = orig_f0.copy()

    # where both are voiced → use original melody pitch
    new_f0 = f0_tts.copy()
    voiced = (f0_tts > 0) & (mapped > 0)
    new_f0[voiced] = mapped[voiced]

    # ── re-synthesize ──
    out_y = pw.synthesize(new_f0, sp_tts, ap_tts, SR)

    # fade edges to avoid clicks
    fade = min(int(0.03 * SR), len(out_y) // 4)
    if fade > 0:
        out_y[:fade]  *= np.linspace(0, 1, fade)
        out_y[-fade:] *= np.linspace(1, 0, fade)

    sf.write(str(output), out_y.astype(np.float32), SR)
    return output


# ═══════════════════════════════════════════════════════════════════
#  Step 5 — 混音 & MP3 导出
# ═══════════════════════════════════════════════════════════════════


def mix_and_export(
    vocals: Path, accomp: Path, work_dir: Path,
    v_gain: float = 0.8, a_gain: float = 1.0,
) -> Path:
    log.info("混音 & 导出…")
    v, _ = librosa.load(str(vocals), sr=SR, mono=True)
    a, _ = librosa.load(str(accomp),  sr=SR, mono=True)

    n = min(len(v), len(a))
    mixed = v[:n] * v_gain + a[:n] * a_gain

    peak = np.max(np.abs(mixed))
    if peak > 1e-6:
        mixed *= 0.95 / peak

    wav_out = work_dir / "output.wav"
    mp3_out = work_dir / "output.mp3"

    sf.write(str(wav_out), mixed, SR)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_out),
         "-codec:a", "libmp3lame", "-b:a", "320k", str(mp3_out)],
        capture_output=True, check=True, timeout=60,
    )
    return mp3_out


# ═══════════════════════════════════════════════════════════════════
#  Gradio UI
# ═══════════════════════════════════════════════════════════════════


def run_pipeline(
    song_name, artist, lyrics, upload, voice_label,
    v_gain, a_gain, progress=gr.Progress(),
):
    _ensure_ffmpeg()
    wd = Path(tempfile.mkdtemp(prefix="cover_"))
    voice = VOICES.get(voice_label, "zh-CN-XiaoxiaoNeural")

    try:
        # ── get audio ────────────────────────────────
        progress(0.05, desc="📥 获取音频…")
        if upload is not None:
            wav = wd / "original.wav"
            _to_wav(Path(upload), wav)
            audio = wav
        elif song_name and song_name.strip():
            audio = download_song(song_name.strip(), (artist or "").strip(), wd)
        else:
            return None, None, None, "❌ 请输入歌曲名称，或上传音频文件"

        if not lyrics or not lyrics.strip():
            return None, None, None, "❌ 请输入新歌词"

        # ── separate ─────────────────────────────────
        progress(0.10, desc="🔀 分离人声与伴奏（较慢，请耐心等待）…")
        voc, acc = separate_vocals(audio, wd)

        # ── melody ───────────────────────────────────
        progress(0.50, desc="🎵 提取原曲旋律…")
        melody = extract_melody(voc)

        # ── synthesize ───────────────────────────────
        progress(0.65, desc="🎤 合成新人声…")
        new_voc = synthesize_singing(lyrics.strip(), melody, wd, voice)

        # ── mix & export ─────────────────────────────
        progress(0.85, desc="🎚️ 混音导出 MP3…")
        mp3 = mix_and_export(new_voc, acc, wd, v_gain, a_gain)

        progress(1.0, desc="✅ 完成")
        return (
            str(mp3), str(acc), str(voc),
            f"✅ 完成！原曲 BPM ≈ {melody['tempo']:.0f}，"
            f"时长 {melody['duration']:.1f}s",
        )
    except Exception as exc:
        log.exception("Pipeline failed")
        return None, None, None, f"❌ {exc}"


def build_app():
    with gr.Blocks(
        title="AI 翻唱工具",
        theme=gr.themes.Soft(),
        css=".title{text-align:center} .sub{text-align:center;opacity:.65;font-size:.95em;margin-bottom:1.2em}",
    ) as app:
        gr.HTML("<h1 class='title'>🎤 AI 翻唱工具</h1>")
        gr.HTML(
            "<p class='sub'>人声分离 → 旋律提取 → 新歌词人声合成 → 混音输出 MP3</p>"
        )

        with gr.Row(equal_height=False):
            # ── inputs ──
            with gr.Column(scale=1):
                with gr.Group():
                    gr.Markdown("#### 音频来源")
                    with gr.Tab("🔍 搜索歌曲"):
                        inp_song   = gr.Textbox(label="歌曲名称", placeholder="小幸运")
                        inp_artist = gr.Textbox(label="歌手",     placeholder="田馥甄")
                    with gr.Tab("📁 上传文件"):
                        inp_upload = gr.Audio(
                            label="上传 MP3 / WAV / FLAC 等",
                            type="filepath",
                        )

                with gr.Group():
                    gr.Markdown("#### 新歌词")
                    inp_lyrics = gr.Textbox(
                        label="歌词文本",
                        placeholder="粘贴新歌词，每行一句…",
                        lines=8,
                    )

                inp_voice = gr.Dropdown(
                    choices=list(VOICES.keys()),
                    value="晓晓 · 女声 (中文)",
                    label="合成音色",
                )

                with gr.Accordion("⚙️ 高级设置", open=False):
                    sl_vg = gr.Slider(0, 2, value=0.8, step=0.05, label="新人声音量")
                    sl_ag = gr.Slider(0, 2, value=1.0, step=0.05, label="伴奏音量")

                btn = gr.Button("🚀 开始生成", variant="primary", size="lg")

            # ── outputs ──
            with gr.Column(scale=1):
                out_status = gr.Textbox(label="状态", interactive=False)
                out_mix    = gr.Audio(label="🎵 最终混音（可下载 MP3）", type="filepath")
                with gr.Accordion("中间产物预览", open=False):
                    out_acc = gr.Audio(label="🎸 纯伴奏", type="filepath")
                    out_voc = gr.Audio(label="🎤 原始人声", type="filepath")

        btn.click(
            fn=run_pipeline,
            inputs=[inp_song, inp_artist, inp_lyrics, inp_upload,
                    inp_voice, sl_vg, sl_ag],
            outputs=[out_mix, out_acc, out_voc, out_status],
        )

        gr.Markdown(
            "---\n"
            "**技术栈** "
            "[Demucs](https://github.com/adefossez/demucs) · "
            "[WORLD Vocoder](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder) · "
            "[Edge-TTS](https://github.com/rany2/edge-tts) · "
            "[librosa](https://librosa.org) · "
            "[Gradio](https://gradio.app)\n\n"
            "**原理** 用 Demucs 分离人声与伴奏；用 WORLD 声码器从原始人声中提取 F0 音高轮廓；"
            "用 Edge-TTS 将新歌词转为语音，再通过 WORLD 将语音音高弯曲到原曲旋律上，"
            "使其「唱出」原来的调子；最后与伴奏混音导出 MP3。\n\n"
            "**局限** 当前使用 TTS + pitch warp 方案，效果介于「说唱」和「唱歌」之间。"
            "如需更自然的歌声，可替换为 DiffSinger 等专业 SVS 模型。"
        )

    return app


if __name__ == "__main__":
    build_app().launch(server_name="0.0.0.0", server_port=7860)
