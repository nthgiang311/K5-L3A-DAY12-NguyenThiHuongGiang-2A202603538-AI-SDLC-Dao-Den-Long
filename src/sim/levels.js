// Standard maps (Ticket-02 Part 2). Angles: from +X, counter-clockwise seen from above => (r cos a, y, r sin a).
const rad = (d) => (d * Math.PI) / 180;
export const polar = (r, deg, y = 0, cx = 0, cz = 0) => [cx + r * Math.cos(rad(deg)), y, cz + r * Math.sin(rad(deg))];
const ring = (r, n, start, step, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => polar(r, start + i * step, y, cx, cz));

export const LEVELS = {
  1: {
    name: 'Đảo Bến',
    start: [0, 0, 0],
    islands: [{ c: [0, 0], r: 40 }],
    bridges: [],
    lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
    moteSpawns: [...ring(12, 8, 0, 45), ...ring(33, 16, 0, 22.5)],
    shadeSpawns: ring(37, 12, 15, 30),
    shadeEvery: 480,
    shadeMax: 6,
    pads: [],
    charms: [],
    drifters: false,
    wind: false,
  },
  2: {
    name: 'Đảo Cau',
    start: [0, 0, 0],
    islands: [{ c: [0, 0], r: 28 }, { c: [70, 0], r: 28 }],
    bridges: [{ x0: 26, x1: 44, z0: -2, z1: 2 }],
    lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
    moteSpawns: [
      ...ring(10, 4, 0, 90), ...ring(22, 8, 0, 45),
      ...ring(10, 4, 0, 90, 0, 70, 0), ...ring(22, 8, 0, 45, 0, 70, 0),
    ],
    shadeSpawns: [...ring(26, 8, 22.5, 45), ...ring(26, 8, 22.5, 45, 0, 70, 0)],
    shadeEvery: 420,
    shadeMax: 8,
    // launch toward the other island's centre: vy 14, horizontal 24 m/s
    pads: [
      { pos: [20, 0, 18], vy: 14, speed: 24, target: [70, 0] },
      { pos: [50, 0, -18], vy: 14, speed: 24, target: [0, 0] },
    ],
    charms: [[35, 0, 0]],
    drifters: true,
    wind: false,
  },
  3: {
    name: 'Đảo Chuông',
    start: [0, 0, -30], // assumption: (0,0,0) is inside the bell tower
    islands: [{ c: [0, 0], r: 45 }],
    bridges: [],
    tiers: true,
    lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
    moteSpawns: [...ring(34, 18, 0, 20, 0), ...ring(18, 8, 20, 20, 3), ...ring(5, 4, 45, 90, 6)],
    shadeSpawns: ring(43, 16, 0, 22.5),
    shadeEvery: 360,
    shadeMax: 10,
    pads: [{ pos: [0, 3, 13], vy: 12, speed: 8, dir: [0, -1] }],
    charms: [[30, 0, 25], [-30, 0, 25]],
    drifters: true,
    wind: true,
  },
};

export const TOWER = { r: 2, top: 14 }; // Night 3 bell tower: 8 m above tier 2 (Y=6)
const RAMPS = [30, 150].map((d) => [Math.cos(rad(d)), Math.sin(rad(d))]);

// Ground height under (x, z) or null over the sea of clouds.
export function groundAt(level, x, z) {
  if (level.tiers) {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    if (r < TOWER.r) return TOWER.top; // solid tower acts as an unclimbable wall
    if (r <= 8) return 6;
    if (r >= 12 && r <= 24 && z > 0) return 3;
    for (const [ux, uz] of RAMPS) {
      const t = x * ux + z * uz; // along the ramp axis
      const s = Math.abs(x * uz - z * ux); // sideways
      if (t >= 24 && t <= 30 && s <= 1.5) return (3 * (30 - t)) / 6;
    }
    return 0;
  }
  for (const i of level.islands) if (Math.hypot(x - i.c[0], z - i.c[1]) <= i.r) return 0;
  for (const b of level.bridges) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return 0;
  return null;
}
