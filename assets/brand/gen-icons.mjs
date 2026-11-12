// 生成 DDL斩 的标志：写出矢量源文件，再导出 app 图标要用的各种 PNG
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// 用法：在任意空文件夹里 npm install @resvg/resvg-js@2，把这个文件放进去，运行
//   node gen-icons.mjs <仓库路径>
import { Resvg } from '@resvg/resvg-js';

const repo = process.argv[2];
const AC = '#c2603e', PAPER = '#faf9f5', INK = '#1f1e1d';

// "DDL" 三个字母用线条画，不靠字体：在哪台手机、哪个浏览器上都一样
const letters = (color) => {
  const D = (x) => `<path d="M${x} 54H${x + 3}A6 6 0 0 1 ${x + 3} 66H${x}Z" fill="none" stroke="${color}" stroke-width="3.6" stroke-linejoin="miter"/>`;
  return `${D(31.5)}${D(45.5)}<path d="M59.5 54V66H68" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="square" stroke-linejoin="miter"/>`;
};

// 日历本身：纸白的页、墨黑的顶栏、两个吊环、红色的 DDL
const calendar = ({ paper = PAPER, ink = INK, text = AC } = {}) => `
  <rect x="22" y="22" width="56" height="58" rx="8" fill="${paper}"/>
  <path d="M22 30a8 8 0 0 1 8-8h40a8 8 0 0 1 8 8v8H22z" fill="${ink}"/>
  <rect x="33" y="16" width="5" height="12" rx="2.5" fill="${ink}"/><rect x="62" y="16" width="5" height="12" rx="2.5" fill="${ink}"/>
  ${text ? letters(text) : ''}`;

// C4：沿一条斜线斩开，上半截还挂着，下半截斜着掉出去
const slashed = (id, inner) => `
  <defs>
    <clipPath id="${id}-top"><polygon points="0,0 100,0 100,44 0,64"/></clipPath>
    <clipPath id="${id}-bottom"><polygon points="0,64 100,44 100,100 0,100"/></clipPath>
  </defs>
  <g transform="translate(0 -2)"><g clip-path="url(#${id}-top)">${inner}</g></g>
  <g transform="translate(6 16) rotate(12 50 50)"><g clip-path="url(#${id}-bottom)">${inner}</g></g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>\n`;

// 完整图标：红底 + 斩开的日历
const full = svg(`<rect width="100" height="100" fill="${AC}"/>${slashed('ddl', calendar())}`);
// 安卓自适应图标的前景：透明底，缩到中间的安全区里（系统会裁成圆形、方形等不同形状）
const fg = svg(`<g transform="translate(50 50) scale(0.7) translate(-50 -50)">${slashed('fg', calendar())}</g>`);
// 单色图标（安卓 13 起的主题图标）：只要轮廓，系统自己上色。字母挖空
// 挖空用的遮罩放在日历内部，跟着两半一起移动、旋转
const mono = svg(`<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${letters('#000')}</mask></defs>
  <g transform="translate(50 50) scale(0.7) translate(-50 -50)">${slashed('mono', `<g mask="url(#m)">${calendar({ paper: '#000', ink: '#000', text: '' })}</g>`)}</g>`);
const bgSvg = svg(`<rect width="100" height="100" fill="${AC}"/>`);

const brand = join(repo, 'assets', 'brand');
mkdirSync(brand, { recursive: true });
writeFileSync(join(brand, 'logo.svg'), full);
writeFileSync(join(brand, 'logo-foreground.svg'), fg);
writeFileSync(join(brand, 'logo-monochrome.svg'), mono);

const png = (src, size, file) => {
  const out = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(repo, 'assets', file), out);
  console.log(file, size, out.length);
};
png(full, 1024, 'icon.png');
png(fg, 1024, 'android-icon-foreground.png');
png(bgSvg, 1024, 'android-icon-background.png');
png(mono, 1024, 'android-icon-monochrome.png');
png(full, 48, 'favicon.png');
png(full, 1024, 'splash-icon.png');
