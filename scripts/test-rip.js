import { compileToJS } from 'rip-lang';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
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
        const usesComponents = /^export\s+\w+\s*=\s*component\b/m.test(code);
        const js = compileToJS(code, { skipPreamble: !usesComponents });
        console.log(`OK ${rel} (${js.split('\n').length} lines)${usesComponents ? ' [component]' : ''}`);
        if (usesComponents && rel.includes('App.rip')) {
            writeFileSync('/tmp/app-compiled.js', js);
        }
        pass++;
    } catch (e) {
        console.log(`FAIL ${rel}: ${e.message}`);
        // Binary search for the failing line
        const code = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = code.split('\n');
        let lastGood = 0;
        for (let i = 1; i <= lines.length; i++) {
            try {
                const snippet = lines.slice(0, i).join('\n');
                const uc = /^export\s+\w+\s*=\s*component\b/m.test(snippet);
                compileToJS(snippet, { skipPreamble: !uc });
                lastGood = i;
            } catch (e2) {
                break;
            }
        }
        if (lastGood > 0) {
            console.log(`  Compiles through line ${lastGood}, fails at ${lastGood + 1}: "${lines[lastGood]?.trim()}"`);
        }
        fail++;
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
