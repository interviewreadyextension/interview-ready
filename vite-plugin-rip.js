/**
 * Vite plugin for rip-lang — compiles .rip files to JavaScript at build time.
 */
import { compileToJS } from 'rip-lang';

export default function ripPlugin() {
    return {
        name: 'vite-plugin-rip',
        enforce: /** @type {const} */ ('pre'),

        transform(code, id) {
            if (!id.endsWith('.rip')) return null;

            try {
                // Strip Windows CRLF — rip-lang parser expects LF only
                const cleaned = code.replace(/\r\n/g, '\n');
                const js = compileToJS(cleaned, { skipPreamble: true });
                return { code: js, map: null };
            } catch (e) {
                this.error(`Rip compile error in ${id}: ${e.message}`);
            }
        },
    };
}
