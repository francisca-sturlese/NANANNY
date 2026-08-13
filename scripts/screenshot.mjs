import { chromium, webkit } from 'playwright';
const out = process.argv[3] || '/private/tmp/claude-502/-Users-cisca/35eacf55-e182-4488-80e7-88e69009f5ff/scratchpad';
const url = process.argv[2] || 'http://127.0.0.1:3100/';
const name = process.argv[4] || 'home';
for (const [label, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await engine.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
  console.log(`${label}: ok, console errors: ${errs.length}`, errs.slice(0,5));
  await b.close();
}
