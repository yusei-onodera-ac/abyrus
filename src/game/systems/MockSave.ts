import { REGION_COUNT } from '../data/regions';
import { EXTRA_STAGE_COUNT, FINAL_STAGE_INDEX } from './ProgressionSystem';
import { SaveSystem, type SaveData } from './SaveSystem';

/** Development only: `?mock=allclear` on the address puts the save in the state
 *  of a player who has finished everything - all 150 main stages, the final
 *  battle, the ending and all 30 Extra stages, every story read - so the late
 *  game can be looked at without playing to it. It is saved like any other
 *  progress (the settings screen's reset starts over), and the parameter is
 *  taken off the address afterwards so a reload doesn't redo it. Production
 *  builds ignore it. Returns whether it was applied. */
export function applyMockFromUrl(save: SaveData): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(location.search);
  if (params.get('mock') !== 'allclear') return false;

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
