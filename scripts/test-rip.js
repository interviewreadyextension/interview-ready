import { compileToJS } from 'rip-lang';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

function findRipFiles(dir) {
    let files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            files.push(...findRipFiles(full));
        } else if (entry.name.endsWith('.rip')) {
            files.push(full);
        }
    }
    return files;
}

const srcDir = join(process.cwd(), 'src');
const files = findRipFiles(srcDir);

let pass = 0;
let fail = 0;

for (const f of files) {
    const rel = relative(process.cwd(), f);
    try {
        const code = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const js = compileToJS(code, { skipPreamble: true });
        console.log(`OK ${rel} (${js.split('\n').length} lines)`);
        pass++;
    } catch (e) {
        console.log(`FAIL ${rel}: ${e.message}`);
        fail++;
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
