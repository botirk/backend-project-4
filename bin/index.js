#!/usr/bin/env node
import { program } from 'commander'
import { downloadPageToFolder } from '../src/main.js'

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
      downloadPageToFolder(url, options.output).then(path => {
        console.log(path)
      }).catch((error) => {
        // eslint-disable-next-line
        if (typeof (error?.toString) === 'function') console.log(error.toString())
      })
    }
  })

program.parse()
