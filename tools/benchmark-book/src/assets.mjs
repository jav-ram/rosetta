/** Placeholder art: small SVGs in a different colour each, so every image is distinct. */
const hue = (n) => (n * 47) % 360;

export function original(number, label) {
  const h = hue(number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
  <rect width="1600" height="1000" fill="hsl(${h} 40% 78%)"/>
  <path d="M0 0L1600 1000M1600 0L0 1000" stroke="hsl(${h} 40% 55%)" stroke-width="6"/>
  <rect x="40" y="40" width="1520" height="920" fill="none" stroke="hsl(${h} 40% 35%)" stroke-width="10"/>
  <text x="800" y="520" font-family="serif" font-size="96" text-anchor="middle" fill="hsl(${h} 40% 25%)">${label}</text>
</svg>
`;
}

export function preview(number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="400" height="250"><rect width="1600" height="1000" fill="hsl(${hue(number)} 40% 70%)"/></svg>
`;
}
