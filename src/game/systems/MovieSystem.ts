/**
 * ストーリームービー: `public/assets/movies/<story script id>.mp4`. Dropping a file with
 * that name in is all it takes for the story to play it instead of the text.
 *
 * Phaser's video loader never opens the file (it always reports success), and the dev
 * server and single-page hosts answer a missing file with index.html and status 200 - so
 * whether a movie really exists is asked here, once per id, by its content type.
 */
const known = new Map<string, Promise<boolean>>();

export const MovieSystem = {
  url(id: string): string {
    return `/assets/movies/${id}.mp4`;
  },

  /** True if a movie file for this script is served. Never rejects. */
  has(id: string): Promise<boolean> {
    let answer = known.get(id);
    if (!answer) {
      answer = fetch(MovieSystem.url(id), { method: 'HEAD' })
        .then((res) => res.ok && !(res.headers.get('content-type') ?? '').includes('text/html'))
        .catch(() => false);
      known.set(id, answer);
    }
    return answer;
  },
};
