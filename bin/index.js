#!/usr/bin/env node
import { program } from 'commander'
import downloadPageWithResourcesToFolder from '../src/main.js'

const cwd = process.cwd()

program
  .usage('[options] <url>')
  .description('Page loader utility')
  .version('1', '-V, --version')
  .argument('<url>', 'url to download')
  .option('-o, --output <output>', `output dir (default: "${cwd}"`, cwd)
  .action((url, options) => {
    if (options.version) {
      console.log('Version 1')
    }
    else if (url) {
      downloadPageWithResourcesToFolder(url, options.output).then(() => {
        process.exit(0)
      }).catch((error) => {
        console.error(String(error))
        process.exit(1)
      })
    }
  })

program.parse()
