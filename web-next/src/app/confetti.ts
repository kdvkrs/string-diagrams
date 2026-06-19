export const fireConfetti = ({
  canvas,
  host,
  finale,
  cssVar
}: {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  finale: boolean;
  cssVar: (name: string, fallback: string) => string;
}) => {
  const c = canvas.getContext('2d');
  if (!c) return;
  const rect = host.getBoundingClientRect();
  const width = Math.max(window.innerWidth, document.documentElement.clientWidth || 0, rect.width, 1);
  const viewportHeight = Math.max(window.innerHeight, document.documentElement.clientHeight || 0, rect.height, 1);
  const height = Math.min(viewportHeight, 460);
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.25));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = [
    cssVar('--accent', '#3b73c4'),
    cssVar('--strand-a', '#0072b2'),
    cssVar('--strand-b', '#d55e00'),
    cssVar('--node-o', '#f0e442'),
    cssVar('--node-x', '#009e73')
  ];
  const duration = finale ? 5200 : 2600;
  const started = Date.now();
  let lastBurst = 0;
  const maxBits = finale ? 170 : 105;
  type ConfettiBit = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;
    w: number;
    h: number;
    color: string;
    life: number;
    maxLife: number;
  };
  const bits: ConfettiBit[] = [];
  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const addBit = (bit: ConfettiBit) => {
    if (bits.length < maxBits) bits.push(bit);
  };
  const burst = (originX: number, originY: number, count: number, spread = 1) => {
    const room = Math.max(0, maxBits - bits.length);
    for (let i = 0; i < Math.min(count, room); i += 1) {
      const angle = randomInRange(-Math.PI * (0.95 * spread), -Math.PI * (0.05 + (1 - spread) * 0.25));
      const speed = randomInRange(2.4, finale ? 8.2 : 7);
      const life = randomInRange(58, finale ? 116 : 96);
      const size = randomInRange(finale ? 5 : 4.5, finale ? 12 : 10);
      addBit({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed + randomInRange(-0.8, 0.8),
        vy: Math.sin(angle) * speed - randomInRange(0.2, 1.8),
        g: randomInRange(0.08, 0.14),
        w: size,
        h: Math.random() > 0.38 ? size * 0.32 : size,
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life
      });
    }
  };
  const rain = (count: number) => {
    for (let i = 0; i < count && bits.length < maxBits; i += 1) {
      const size = randomInRange(4, 9);
      const life = randomInRange(80, 132);
      addBit({
        x: randomInRange(width * 0.08, width * 0.92),
        y: randomInRange(-28, 10),
        vx: randomInRange(-0.45, 0.45),
        vy: randomInRange(1.8, 3.1),
        g: randomInRange(0.035, 0.065),
        w: size,
        h: size * 0.36,
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life
      });
    }
  };
  const tick = () => {
    const elapsed = Date.now() - started;
    const timeLeft = Math.max(0, duration - elapsed);
    if (elapsed - lastBurst > 320 && timeLeft > 0) {
      lastBurst = elapsed;
      const particleCount = Math.max(finale ? 5 : 3, Math.floor((finale ? 16 : 11) * (timeLeft / duration)));
      burst(width * randomInRange(0.08, 0.28), height * randomInRange(-0.03, 0.16), particleCount, 0.92);
      burst(width * randomInRange(0.72, 0.92), height * randomInRange(-0.03, 0.16), particleCount, 0.92);
      if (finale && elapsed < duration * 0.7) {
        rain(8);
        burst(width * randomInRange(0.32, 0.68), height * randomInRange(0.02, 0.24), Math.max(2, Math.floor(particleCount * 0.45)), 0.72);
      }
    }
    c.clearRect(0, 0, width, height);
    const flash = Math.max(0, 1 - elapsed / (finale ? 760 : 520));
    if (flash > 0) {
      c.globalAlpha = flash * 0.34;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(width * 0.5, height * 0.24, (1 - flash) * (finale ? 180 : 120) + 22, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    for (let i = bits.length - 1; i >= 0; i -= 1) {
      const bit = bits[i];
      if (bit.life <= 0) {
        bits.splice(i, 1);
        continue;
      }
      bit.life -= 1;
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.vy += bit.g;
      if (bit.life <= 0 || bit.y > height + 80) {
        bits.splice(i, 1);
        continue;
      }
      c.fillStyle = bit.color;
      c.globalAlpha = Math.min(1, bit.life / Math.min(22, bit.maxLife * 0.6));
      c.fillRect(bit.x - bit.w * 0.5, bit.y - bit.h * 0.5, bit.w, bit.h);
    }
    c.globalAlpha = 1;
    if (timeLeft > 0 || bits.length > 0) requestAnimationFrame(tick);
    else c.clearRect(0, 0, width, height);
  };
  burst(width * 0.5, height * 0.24, finale ? 70 : 42, 0.72);
  burst(width * 0.2, height * 0.12, finale ? 28 : 16, 0.9);
  burst(width * 0.8, height * 0.12, finale ? 28 : 16, 0.9);
  if (finale) rain(26);
  tick();
};
