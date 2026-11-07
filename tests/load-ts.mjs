import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const cache = new Map();
// 测试纯逻辑模块，使用项目已有的 TypeScript，不额外安装测试运行时。
export async function loadTs(relative) {
  function compile(file) {
    if (cache.has(file)) return cache.get(file);
    let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    code = code.replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, name) =>
      `from ${quote}${compile(path.resolve(path.dirname(file), name + '.ts'))}${quote}`);
    const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    cache.set(file, url);
    return url;
  }
  return import(compile(path.resolve(relative)));
}
