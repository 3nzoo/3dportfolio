// Tune the experimental board here. The renderer and Rapier use the same pins.
export const BOARD_SETTINGS = {
  rows: 8,
  columns: [7, 8],
  horizontalSpacing: 0.84,
  verticalSpacing: 0.72,
  topRowY: 8.3,
  pinRadius: 0.105,
  channelSeconds: 1.05,
  channelFastSeconds: 0.45,
  releaseVerticalSpeed: 1.5,
  springTurns: 11,
  springMinLength: 0.65,
  springMaxLength: 1.65,
  springBaseY: 0.9,
};

export function createBoardPins() {
  return Array.from({ length: BOARD_SETTINGS.rows }, (_, row) => {
    const columns = BOARD_SETTINGS.columns[row % BOARD_SETTINGS.columns.length];
    return Array.from({ length: columns }, (_, column) => ({
      x: (column - (columns - 1) / 2) * BOARD_SETTINGS.horizontalSpacing,
      y: BOARD_SETTINGS.topRowY - row * BOARD_SETTINGS.verticalSpacing,
      radius: BOARD_SETTINGS.pinRadius,
    }));
  }).flat();
}

export const CHANNEL_POINTS = [
  [4.12, 2.95, 0.12], [4.12, 5.5, 0.12], [4.12, 8.35, 0.12],
  [4.08, 8.58, 0.12], [3.95, 8.76, 0.12], [3.75, 8.87, 0.12],
  [3.5, 8.92, 0.12],
  [3.1, 8.95, 0.12],
];
export const LAUNCH_ORIGIN = { x: 4.12, y: 2.95, z: 0.12 };
export const RELEASE_POINT = { x: 3.1, y: 8.95, z: 0.12 };
