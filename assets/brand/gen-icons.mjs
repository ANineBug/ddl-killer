// 生成 DDL斩 的标志：写出矢量源文件，再导出 app 图标要用的各种 PNG
// 用法：node gen-icons.mjs <仓库根目录>（需要 @resvg/resvg-js，放在装了它的文件夹里跑）
//
// 标志：纸白底、红色的粗体 D，沿一条斜线斩开一道细缝，下半截往右下错开一点
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const repo = process.argv[2];
const AC = '#c2603e', PAPER = '#faf9f5';

// 字母 D：外轮廓减掉里面的空心，用线条画，不靠字体
const D = 'M27 20H50A30 30 0 0 1 50 80H27Z M40 32H49A18 18 0 0 1 49 68H40Z';

// 斩的那一刀：从 (10,60) 到 (90,44) 的斜线。上半截往上提 1，下半截往右下错开
const cutY = (x) => 60 - 0.2 * (x - 10);
const slashed = (id, color) => `
  <defs>
    <clipPath id="${id}-top"><polygon points="-20,-20 120,-20 120,${cutY(120)} -20,${cutY(-20)}"/></clipPath>
    <clipPath id="${id}-bottom"><polygon points="-20,${cutY(-20)} 120,${cutY(120)} 120,120 -20,120"/></clipPath>
  </defs>
  <g transform="translate(-4.5 -1)">
    <g transform="translate(0 -1)"><path clip-path="url(#${id}-top)" d="${D}" fill="${color}" fill-rule="evenodd"/></g>
    <g transform="translate(2.5 3.5)"><path clip-path="url(#${id}-bottom)" d="${D}" fill="${color}" fill-rule="evenodd"/></g>
  </g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>\n`;
// 缩到中间的安全区里：安卓会把自适应图标裁成圆形、方形等不同形状
const safe = (body) => `<g transform="translate(50 50) scale(0.72) translate(-50 -50)">${body}</g>`;

// 完整图标：纸白底 + 红 D
const full = svg(`<rect width="100" height="100" fill="${PAPER}"/>${slashed('ddl', AC)}`);
// 安卓自适应图标的前景：透明底，只有 D
const fg = svg(safe(slashed('fg', AC)));
// 单色图标（安卓 13 起的主题图标）：只要形状，系统自己上色
const mono = svg(safe(slashed('mono', '#000')));
const bgSvg = svg(`<rect width="100" height="100" fill="${PAPER}"/>`);

const brand = join(repo, 'assets', 'brand');
mkdirSync(brand, { recursive: true });
writeFileSync(join(brand, 'logo.svg'), full);
writeFileSync(join(brand, 'logo-foreground.svg'), fg);
writeFileSync(join(brand, 'logo-monochrome.svg'), mono);
// 网站用的图标就是完整图标
writeFileSync(join(repo, 'site', 'favicon.svg'), full);

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
