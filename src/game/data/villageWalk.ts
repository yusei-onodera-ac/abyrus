/**
 * Where the villagers cannot walk because the plot's picture has water there (public/assets/village/ground_<tier>.png):
 * the pond of the rural plot, the river of the town, the two canals of the royal city. Each number is a tile,
 * `y * VILLAGE_COLS + x`. Worked out from the pictures' own colours (a tile with a fifth of its area under water);
 * if a plot picture is redrawn, redo it - the outermost ring of tiles (the hedge or the fence) is kept clear separately.
 */
export const VILLAGE_WATER_TILES: Record<number, number[]> = {
  1: [32, 33, 49, 50, 51, 68, 69, 86, 87],
  2: [14, 32, 50, 51, 69, 70, 88, 106, 124, 178, 195, 196, 213, 214, 231, 232, 249, 250, 267, 268, 285, 286],
  3: [267, 271, 272, 273, 274, 275, 276, 279, 280, 281, 282, 283, 284, 285, 286, 288, 289, 290, 291, 292, 293, 294, 298, 299, 300, 301, 302, 303, 304],
};
