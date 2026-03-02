/**
 * Vite plugin for rip-lang — compiles .rip files to JavaScript at build time.
 *
 * For files that contain `component`/`render` keywords, the Rip UI runtime
 * (reactive signals, component base class, reconciler) is injected as a
 * globalThis preamble. Only the FIRST component file gets the full preamble;
 * subsequent ones use skipPreamble since the globals are already available.
 */
import { compileToJS } from 'rip-lang';

export default function ripPlugin() {
    let preambleEmitted = false;

    return {
        name: 'vite-plugin-rip',
        enforce: /** @type {const} */ ('pre'),

        // Reset per-build
        buildStart() {
            preambleEmitted = false;
        },

        transform(code, id) {
            if (!id.endsWith('.rip')) return null;

            try {
                // Strip Windows CRLF — rip-lang parser expects LF only
                const cleaned = code.replace(/\r\n/g, '\n');

                // Check if this file uses components (contains 'component' keyword)
                const usesComponents = /^export\s+\w+\s*=\s*component\b/m.test(cleaned) ||
                    /^\w+\s*=\s*component\b/m.test(cleaned);

                // First component file gets full preamble (runtime injected on globalThis)
                const needsPreamble = usesComponents && !preambleEmitted;
                if (needsPreamble) preambleEmitted = true;

                const js = compileToJS(cleaned, { skipPreamble: !needsPreamble });
                return { code: js, map: null };
            } catch (e) {
                this.error(`Rip compile error in ${id}: ${e.message}`);
            }
        },
    };
}
