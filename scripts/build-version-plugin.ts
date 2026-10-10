import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

export function buildVersionPlugin(id: string): Plugin {
  return {
    name: 'imobile-build-version',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const bootstrap = readFileSync(path.resolve(__dirname, '../src/lib/app-update.js'), 'utf8')
        return html.replace('<!-- app-update-bootstrap -->',
          `<meta name="imobile-build" content="${id}"><script>${bootstrap.replace(/<\/script/gi, '<\\/script')}</script>`)
      },
    },
    generateBundle(_options, bundle) {
      const assets = new Set<string>()
      for (const output of Object.values(bundle)) {
        // Include lazy route chunks too: a complete release must be available
        // before the browser leaves the working page.
        if (output.type === 'chunk') assets.add(`/${output.fileName}`)
        if (output.type === 'asset' && output.fileName.endsWith('.css')) assets.add(`/${output.fileName}`)
      }
      this.emitFile({ type: 'asset', fileName: 'build-version.json', source: JSON.stringify({ id, assets: [...assets] }) })
    },
  }
}
