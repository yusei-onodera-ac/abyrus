import { REGION_COUNT } from '../data/regions';
import { EXTRA_STAGE_COUNT, FINAL_STAGE_INDEX } from './ProgressionSystem';
import { HERO_ROSTER, createHeroInstance } from '../data/heroes';
import { SaveSystem, type SaveData } from './SaveSystem';

/** Development only: `?mock=allheroes` gives one copy of every character; `?mock=allclear` on the address puts the save in the state
 *  of a player who has finished everything - all 150 main stages, the final
 *  battle, the ending and all 30 Extra stages, every story read - so the late
 *  game can be looked at without playing to it. It is saved like any other
 *  progress (the settings screen's reset starts over), and the parameter is
 *  taken off the address afterwards so a reload doesn't redo it. Production
 *  builds ignore it. Returns whether it was applied. */
export function applyMockFromUrl(save: SaveData): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(location.search);
  const which = params.get('mock');
  if (which === 'tutorial') {
    // A brand-new player: opening story and tutorial start over (progress is left alone).
    save.tutorial = { opening: false, step: 0, done: false, village: { step: 0, done: false } };
    save.stageProgress = 0;
    SaveSystem.save(save);
    params.delete('mock');
    const left = params.toString();
    history.replaceState(null, '', location.pathname + (left ? `?${left}` : ''));
    return true;
  }
  if (which === 'allheroes') {
    // Every character in the roster, one copy each, at a spread of levels (for looking at the list screens).
    HERO_ROSTER.forEach((def, i) => {
      if (!save.heroes.some((h) => h.heroId === def.id)) save.heroes.push(createHeroInstance(def.id, `mock-${def.id}`, 1 + ((i * 7) % 100)));
    });
    SaveSystem.save(save);
    params.delete('mock');
    const left = params.toString();
    history.replaceState(null, '', location.pathname + (left ? `?${left}` : ''));
    return true;
  }
  if (which !== 'allclear') return false;

  const seen = (): boolean[] => Array.from({ length: REGION_COUNT }, () => true);
  save.stageProgress = FINAL_STAGE_INDEX + 1;
  save.extraProgress = EXTRA_STAGE_COUNT;
  save.storyFlags = { regionIntro: seen(), regionOutro: seen(), finalIntro: true, ending: true };
  SaveSystem.save(save);

  params.delete('mock');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
  return true;
}

/** Development only: `?scene=<key>` opens that screen; `?battle=65` goes straight into that main stage's fight (0-149); add
 *  `&mode=extra` (0-29) or `&mode=final` for those, or use `?battle=infinite` for the endless
 *  mode. For looking at a region's enemies and backdrop without playing up to it.
 *  Production builds ignore it. */
export function battleFromUrl(): { scene: string; data: Record<string, unknown> } | null {
  if (!import.meta.env.DEV) return null;
  const params = new URLSearchParams(location.search);
  // `?scene=Collection` opens any screen by its key (and `&data={"tab":"add"}` gives it data): for walking every screen in a test.
  const sceneKey = params.get('scene');
  if (sceneKey && /^[A-Za-z]+$/.test(sceneKey)) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(params.get('data') ?? '{}') as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { scene: sceneKey, data };
  }
  const raw = params.get('battle');
  if (raw === 'infinite') return { scene: 'InfiniteRun', data: {} };
  const stageIndex = raw === null ? NaN : Number(raw);
  if (!Number.isInteger(stageIndex) || stageIndex < 0) return null;
  const mode = params.get('mode');
  const wave = params.get('wave');
  return { scene: 'Battle', data: { stageIndex, mode: mode === 'extra' || mode === 'final' ? mode : undefined, wave: wave === null ? undefined : Number(wave) } };
}
