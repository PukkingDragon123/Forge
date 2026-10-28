// STUB audio (STUB_AUDIO=1)
export class Audio { unlock() {} play() {} playAt() {} time() { return performance.now() / 1000; } loop() { return { stop() {}, setVol() {} }; } music() {} stopMusic() {} metronome(bpm, beats, start) { return Array.from({ length: beats }, (_, i) => start + (i * 60) / bpm); } setVolumes() {} }
