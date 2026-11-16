import { SettingsSystem } from './SettingsSystem';
import type { SaveData } from './SaveSystem';
import { MusicSystem } from './MusicSystem';

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
    // The music keeps quiet while someone speaks, and comes back when the line is over (or could not be played).
    const release = (): void => {
      if (current === audio) MusicSystem.duck('voice', false);
    };
    audio.addEventListener('error', release);
    audio.addEventListener('ended', release);
    audio.addEventListener('pause', release);
    current = audio;
    MusicSystem.duck('voice', true);
    void audio.play().catch(release);
  },

  stop(): void {
    MusicSystem.duck('voice', false);
    if (!current) return;
    current.pause();
    current = null;
  },
};
