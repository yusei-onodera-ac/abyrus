import { SettingsSystem } from './SettingsSystem';
import type { SaveData } from './SaveSystem';

/** The tutorial pet's voice lines: `public/assets/voice/<step id>.mp3`. The files are
 *  supplied separately; a step whose file is missing is simply silent (its text
 *  still shows). Plays at the ボイス volume of the settings. */
let current: HTMLAudioElement | null = null;

export const VoiceSystem = {
  play(save: SaveData, id: string): void {
    this.stop();
    const volume = SettingsSystem.getVolume(save, 'voice');
    if (volume <= 0 || typeof Audio === 'undefined') return;
    const audio = new Audio(`/assets/voice/${id}.mp3`);
    audio.volume = Math.min(1, volume);
    // A missing file (or one the browser may not play yet) is not an error worth showing.
    audio.addEventListener('error', () => undefined);
    void audio.play().catch(() => undefined);
    current = audio;
  },

  stop(): void {
    if (!current) return;
    current.pause();
    current = null;
  },
};
