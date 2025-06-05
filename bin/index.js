#!/usr/bin/env node
import { program } from 'commander'
import { downloadPageWithResourcesToFolder } from '../src/main.js'

const cwd = process.cwd()

program
  .usage('[options] <url>')
  .description('Page loader utility')
  .version('1', '-V, --version')
  .argument('<url>', 'url to download')
  .option('-o, --output <output>', `output dir (default: "${cwd}"`, cwd)
  .action((url, options) => {
    // eslint-disable-next-line
    if (options.version) {
      console.log('Version 1')
    }
    else if (url) {
      // eslint-disable-next-line
      downloadPageWithResourcesToFolder(url, options.output).then(() => {
        // for (const path of paths) console.log(path)
        process.exit(0)
      }).catch((error) => {
        console.error(String(error))
        process.exit(1)
      })
    }
  })

program.parse()
